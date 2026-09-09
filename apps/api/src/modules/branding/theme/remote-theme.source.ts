import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  parseThemeDocument,
  THEME_SOURCE_KEY,
  type ThemeDocument,
  type ThemeMissingRequirement,
  type ThemeSourceReadiness,
} from '@ashniva/types';

import { AppConfigService } from '../../../config/app-config.service';
import {
  BlockedRequestError,
  SafeHttpService,
} from '../../../infrastructure/http/safe-http.service';
import { redactMessage } from '../../integrations/redact';
import { ThemeConnectionService, type ThemeManagerAccount } from './theme-connection.service';
import { ThemeDocumentCache } from './theme-document-cache';
import {
  THEME_BEHAVIOUR_WHEN_UNREADY,
  THEME_MANAGER_REQUIREMENTS,
} from './theme-manager-requirements';
import type { ThemeContext, ThemeSource } from './theme-source.interface';

/**
 * The largest response a theme document may arrive in — the same cap the support callback
 * transport applies, and for the same reason.
 *
 * `SafeHttpService` would otherwise allow its 5 MB default. A complete document is a few
 * kilobytes of bounded tokens, so anything approaching this is either broken or hostile, and
 * without a cap every API instance would buffer and run a schema over 5 MB once per organization
 * per TTL, on a path whose whole promise is that it cannot cost anybody their sign-in page.
 */
const THEME_DOCUMENT_MAX_BYTES = 64 * 1024;

/**
 * Reads a theme from an Ashniva Theme Manager.
 *
 * **What is real here, and what is not.** Everything on Desk's side of the boundary is
 * implemented: the connection and its encrypted credential, the outbound request through the
 * shared destination guard, validation of whatever comes back against the same schema an
 * administrator's own edit goes through, the last-good-document cache, and a readiness report
 * that names what is still owed. What is *not* implemented, and is not guessed at, is the Theme
 * Manager's API — there is no documented endpoint in this repository, so this class will not
 * invent one. It makes a request only when an operator has supplied the path themselves, and it
 * says so in `readiness()` either way. See `docs/theme-manager-integration.md`.
 *
 * **The failure behaviour is the feature.** `load()` is called from `GET /branding`, which is
 * public and is the first thing the web app asks for. So it never rejects, and it never waits on
 * the network: a fresh cached document is served outright, a stale one is served while a refresh
 * runs behind the request, and when there is nothing cached it returns null and the caller falls
 * back to the organization's stored branding and then to the built-in theme. A Theme Manager that
 * is down, slow, hostile or serving nonsense costs a tenant their newest tokens. It cannot cost
 * anybody their sign-in page.
 */
@Injectable()
export class RemoteThemeSource implements ThemeSource, OnModuleDestroy {
  readonly key = THEME_SOURCE_KEY.REMOTE;

  private readonly logger = new Logger(RemoteThemeSource.name);
  private readonly cache: ThemeDocumentCache;
  /** One refresh per organization at a time; a burst of requests must not become a burst of calls. */
  private readonly inFlight = new Map<string, Promise<ThemeDocument | null>>();

  constructor(
    private readonly config: AppConfigService,
    private readonly connections: ThemeConnectionService,
    private readonly http: SafeHttpService,
  ) {
    this.cache = new ThemeDocumentCache(config.theme.cacheTtlSeconds * 1000);
  }

  async load(context: ThemeContext): Promise<ThemeDocument | null> {
    const fresh = this.cache.get(context.organizationId);
    if (fresh) {
      return fresh.document;
    }
    // Started, not awaited. The caller is on a response path and the request it would wait for is
    // to a service Desk does not control.
    void this.refresh(context);
    return this.cache.getStale(context.organizationId)?.document ?? null;
  }

  /**
   * Fetches, validates and caches — the whole remote path, in one awaitable call.
   *
   * Public so a test can drive it deterministically instead of racing a background promise, and
   * so an administrator's "check now" has something to call. Resolves to null on every failure;
   * it never rejects, because its ordinary caller is `load()` and an unhandled rejection from a
   * fire-and-forget promise takes the process down.
   */
  async refresh(context: ThemeContext): Promise<ThemeDocument | null> {
    const existing = this.inFlight.get(context.organizationId);
    if (existing) {
      return existing;
    }
    const work = this.fetchDocument(context).finally(() => {
      this.inFlight.delete(context.organizationId);
    });
    this.inFlight.set(context.organizationId, work);
    return work;
  }

  /** Lets a shutting-down process finish the refreshes it started rather than orphan sockets. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  private async fetchDocument(context: ThemeContext): Promise<ThemeDocument | null> {
    try {
      const account = await this.connections.account(context.organizationId);
      const url = account && this.documentUrl(account);
      if (!account || !url) {
        // Not an error: an unconfigured tenant, or the vendor half that nobody has supplied yet.
        return null;
      }

      const response = await this.http.fetch(url, {
        method: 'GET',
        timeoutMs: this.config.theme.requestTimeoutMs,
        maxBytes: THEME_DOCUMENT_MAX_BYTES,
        headers: {
          accept: 'application/json',
          ...(account.credential
            ? { [account.authHeader]: `${account.authPrefix}${account.credential}` }
            : {}),
        },
      });

      if (!response.ok) {
        // The status only. A provider error body can echo the request, and the request carries a
        // credential in a header this code put there.
        this.logger.warn(
          `The Theme Manager returned ${response.status} for organization ${context.organizationSlug}`,
        );
        return null;
      }

      return this.acceptDocument(context, await response.json());
    } catch (error) {
      if (error instanceof BlockedRequestError) {
        this.http.logRefusal(error, 'Theme Manager');
        return null;
      }
      this.logger.warn(
        `Could not read a theme for organization ${context.organizationSlug}: ${redactMessage(error)}`,
      );
      return null;
    }
  }

  /** Validates and caches, or refuses and keeps whatever was cached before. */
  private acceptDocument(context: ThemeContext, body: unknown): ThemeDocument | null {
    const document = parseThemeDocument(body);
    if (!document) {
      // Refused whole rather than applied in part: a document Desk half-understands would
      // produce a page that is neither the old theme nor the new one.
      this.logger.warn(
        `The Theme Manager served a document Ashniva Desk does not understand for organization ` +
          `${context.organizationSlug}; the previous theme is being kept`,
      );
      return null;
    }
    this.cache.set(context.organizationId, document);
    return document;
  }

  /**
   * The absolute URL the document is read from, or null when the path is not configured.
   *
   * The path is joined against the base URL by hand rather than with `new URL(path, base)`,
   * because that helper treats an absolute URL in the second argument as a replacement: a
   * `documentPath` of `https://elsewhere.example/x` would silently move the request to another
   * host. The destination guard would still check that host, which makes this belt and braces
   * rather than the only defence — but "the operator configured a path" should not be a way to
   * choose a different server.
   */
  private documentUrl(account: ThemeManagerAccount): string | null {
    if (!account.baseUrl || !account.documentPath?.startsWith('/')) {
      return null;
    }
    if (account.documentPath.startsWith('//')) {
      return null;
    }
    return `${account.baseUrl.replace(/\/+$/, '')}${account.documentPath}`;
  }

  async readiness(context: ThemeContext | null): Promise<ThemeSourceReadiness> {
    const cached = context ? this.cache.getStale(context.organizationId) : null;
    const missing = [...(await this.connectionGaps(context)), ...THEME_MANAGER_REQUIREMENTS];

    return {
      source: this.key,
      // A document in hand is the only evidence that this source works; a configured connection
      // is not, because nothing here has ever spoken to the real product.
      healthy: cached !== null,
      ready: READY_CLAIMS.map((claim) => claim.claim),
      missing,
      behaviourWhenUnready: THEME_BEHAVIOUR_WHEN_UNREADY,
      lastDocumentAt: cached?.storedAt.toISOString() ?? null,
    };
  }

  /** What is missing about *this tenant's* configuration, ahead of what is missing about the API. */
  private async connectionGaps(context: ThemeContext | null): Promise<ThemeMissingRequirement[]> {
    if (!context) {
      return [];
    }
    const account = await this.connections.account(context.organizationId).catch(() => null);
    if (!account) {
      return [
        {
          key: 'connection',
          what: `${context.organizationSlug} has no enabled Theme Manager integration connection.`,
          needs: ['A Theme Manager connection with its base URL and credential, switched on.'],
        },
      ];
    }
    if (!account.baseUrl) {
      return [
        {
          key: 'base-url',
          what: 'The connection has no API base URL in its settings.',
          needs: ["The Theme Manager's host for this tenant."],
        },
      ];
    }
    if (!account.documentPath) {
      return [
        {
          key: 'document-path',
          what:
            'The connection names no path to read the theme from, and Desk will not guess one. ' +
            'No request is made at all until this is supplied.',
          needs: ['The documented path that returns a tenant’s live theme document.'],
        },
      ];
    }
    return [];
  }
}

/**
 * Desk's half of the boundary — what this source is claiming, on an administrator's screen, to
 * already do.
 *
 * **Each claim carries a key, and each key has a test.** A readiness report is a security claim
 * made to somebody who cannot check it themselves ("validated against the same schema an
 * administrator's own edit goes through" is not reassurance, it is an assertion about this code),
 * and a list of prose that nothing verifies is how such a list stays on the screen after the
 * behaviour behind it changes. `remote-theme.source.spec.ts` asserts one behaviour per key and
 * fails if a key here has no test — so a claim cannot be added without earning it, and a
 * behaviour cannot be dropped while the screen still promises it. The one half that is asserted
 * elsewhere is the credential's encryption at rest, which is `secret-cipher.service.spec.ts`.
 */
export const READY_CLAIMS = [
  {
    key: 'connection',
    claim:
      'A per-tenant connection with its credential encrypted at rest (AES-256-GCM), read ' +
      'for the organization being resolved and sent in one configured header and nowhere else.',
  },
  {
    key: 'destination-guard',
    claim:
      'Outbound requests through the shared destination guard, which refuses loopback, ' +
      'private, link-local and cloud-metadata addresses and re-checks every redirect.',
  },
  {
    key: 'validation',
    claim:
      'Validation of the served document against the same schema an administrator’s own ' +
      'edit goes through — every value checked against its own kind before it reaches a CSS ' +
      'property.',
  },
  {
    key: 'response-cap',
    claim:
      'A 64 KB cap on the response, so a Theme Manager that answers with something enormous ' +
      'is refused rather than buffered and parsed.',
  },
  {
    key: 'cache',
    claim: 'A last-good-document cache with a TTL, served while a refresh runs behind the request.',
  },
  {
    key: 'fallback',
    claim:
      'A fallback ladder: cached document, then the organization’s stored branding, then ' +
      'the built-in theme. No request waits on the Theme Manager and none fails because of it.',
  },
] as const satisfies readonly { key: string; claim: string }[];
