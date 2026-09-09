import { brandingUpdateSchema, THEME_DOCUMENT_VERSION, type ThemeDocument } from '@ashniva/types';

import type { AppConfigService } from '../../../config/app-config.service';
import {
  BlockedRequestError,
  type SafeHttpService,
  type SafeRequestInit,
} from '../../../infrastructure/http/safe-http.service';
import { READY_CLAIMS, RemoteThemeSource } from './remote-theme.source';
import type { ThemeConnectionService, ThemeManagerAccount } from './theme-connection.service';
import type { ThemeContext } from './theme-source.interface';

/** What the source hands `SafeHttpService`, as this file needs to read it back off the mock. */
type RequestOptions = SafeRequestInit & { headers: Record<string, string> };

const CONTEXT: ThemeContext = { organizationId: 'org-1', organizationSlug: 'acme' };

const ACCOUNT: ThemeManagerAccount = {
  baseUrl: 'https://themes.example.test',
  documentPath: '/tenants/acme/theme',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  credential: 'secret-token',
};

const DOCUMENT: ThemeDocument = {
  version: THEME_DOCUMENT_VERSION,
  colors: { brandPrimary: '#112233' },
};

function build(options: {
  account?: ThemeManagerAccount | null;
  fetch?: jest.Mock;
  ttlSeconds?: number;
}) {
  const fetchMock = options.fetch ?? jest.fn();
  const http = {
    fetch: fetchMock,
    logRefusal: jest.fn(),
  } as unknown as SafeHttpService;
  const connections = {
    account: jest.fn().mockResolvedValue(options.account === undefined ? ACCOUNT : options.account),
  } as unknown as ThemeConnectionService;
  const config = {
    theme: {
      useRemoteSource: true,
      cacheTtlSeconds: options.ttlSeconds ?? 300,
      requestTimeoutMs: 5_000,
    },
  } as unknown as AppConfigService;

  return { source: new RemoteThemeSource(config, connections, http), fetchMock, http, connections };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RemoteThemeSource — a Theme Manager that misbehaves costs tokens, never the page', () => {
  it('returns null and never rejects when the Theme Manager is unreachable', async () => {
    const { source, fetchMock } = build({
      fetch: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:443')),
    });

    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    await expect(source.load(CONTEXT)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns null when the response is not JSON at all', async () => {
    const { source } = build({
      fetch: jest.fn().mockResolvedValue(new Response('<html>maintenance</html>', { status: 200 })),
    });
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
  });

  it('returns null on an error status and keeps the last good document', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(DOCUMENT))
      .mockResolvedValue(jsonResponse({ message: 'gone' }, 503));
    const { source } = build({ fetch: fetchMock });

    await expect(source.refresh(CONTEXT)).resolves.toEqual(DOCUMENT);
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    // The cached document survives the failure, which is the whole point of caching it.
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
  });

  it('refuses a document it cannot validate rather than half-applying it', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(DOCUMENT))
      .mockResolvedValue(jsonResponse({ version: 1, colors: { brandPrimary: 'red' } }));
    const { source } = build({ fetch: fetchMock });

    await expect(source.refresh(CONTEXT)).resolves.toEqual(DOCUMENT);
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
  });

  it('refuses a document whose version it does not understand', async () => {
    const { source } = build({
      fetch: jest.fn().mockResolvedValue(jsonResponse({ version: 99, colors: {} })),
    });
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
  });

  it('serves the cached document without calling out again', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source } = build({ fetch: fetchMock });

    await source.refresh(CONTEXT);
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale document while the refresh behind the request runs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source } = build({ fetch: fetchMock, ttlSeconds: 1 });

    await source.refresh(CONTEXT);
    jest.useFakeTimers().setSystemTime(Date.now() + 5_000);
    try {
      // Stale, so `load` starts a refresh — and answers from the cache rather than waiting for it.
      await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
    } finally {
      jest.useRealTimers();
    }
    await source.onModuleDestroy();
  });

  it('makes one request for a burst of concurrent loads', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source } = build({ fetch: fetchMock });

    await Promise.all([source.refresh(CONTEXT), source.refresh(CONTEXT), source.refresh(CONTEXT)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('RemoteThemeSource — what it refuses to do', () => {
  it('makes no request at all when nothing names a document path', async () => {
    const { source, fetchMock } = build({
      account: { ...ACCOUNT, documentPath: null },
    });

    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    // The vendor half. Desk will not invent an endpoint, so it asks for nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request when the tenant has no connection', async () => {
    const { source, fetchMock } = build({ account: null });
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * The SSRF guard owns the decision; what is asserted here is that this source goes through it
   * and treats a refusal as an ordinary miss rather than an error escaping into a response.
   */
  it('lets the destination guard refuse a private or loopback host, and falls back quietly', async () => {
    const { source, http } = build({
      account: { ...ACCOUNT, baseUrl: 'https://themes.internal.test' },
      fetch: jest
        .fn()
        .mockRejectedValue(new BlockedRequestError('themes.internal.test', 'a loopback address')),
    });

    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    expect(http.logRefusal).toHaveBeenCalled();
  });

  it('never lets a configured path move the request to another host', async () => {
    const { source, fetchMock } = build({
      account: { ...ACCOUNT, documentPath: '//evil.example.test/theme' },
      fetch: jest.fn().mockResolvedValue(jsonResponse(DOCUMENT)),
    });

    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the credential in the configured header and nowhere else', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source } = build({ fetch: fetchMock });

    await source.refresh(CONTEXT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestOptions];
    expect(url).toBe('https://themes.example.test/tenants/acme/theme');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    // "And nowhere else": not in the URL a proxy or an access log would keep, and not in a body.
    expect(url).not.toContain('secret-token');
    expect(init.body).toBeUndefined();
    const elsewhere = Object.entries(init.headers).filter(([name]) => name !== 'Authorization');
    expect(elsewhere.map(([, value]) => value).join(' ')).not.toContain('secret-token');
  });
});

/**
 * Every claim `readiness()` makes about Desk's own half, checked.
 *
 * A readiness report is read by somebody who cannot verify it — an administrator deciding whether
 * to switch a deployment's theme source over, being told in prose that documents are "validated
 * against the same schema an administrator's own edit goes through". That is an assertion about
 * this file, not a reassurance, and prose that nothing tests is prose that outlives the behaviour
 * it describes. So each entry in `READY_CLAIMS` has a key, and each key has a test below; the
 * first test fails if a claim is added without one.
 */
describe('RemoteThemeSource.readiness — the claims it makes about Desk’s half are true', () => {
  const CHECKED = [
    'connection',
    'destination-guard',
    'validation',
    'response-cap',
    'cache',
    'fallback',
  ];

  it('claims exactly what is checked here, and reports those claims verbatim', async () => {
    expect(READY_CLAIMS.map((claim) => claim.key)).toEqual(CHECKED);

    const { source } = build({});
    const readiness = await source.readiness(CONTEXT);
    expect(readiness.ready).toEqual(READY_CLAIMS.map((claim) => claim.claim));
  });

  it('connection: reads the credential for the organization being resolved, and no other', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source, connections } = build({ fetch: fetchMock });

    await source.refresh(CONTEXT);
    // The one place a Theme Manager credential is decrypted, asked for this tenant by id. That
    // it is AES-256-GCM at rest is `secret-cipher.service.spec.ts`, not something to restate here.
    expect(connections.account).toHaveBeenCalledWith(CONTEXT.organizationId);
    expect(connections.account).toHaveBeenCalledTimes(1);
  });

  it('destination-guard: every request goes through it, and a refusal is an ordinary miss', async () => {
    const globalFetch = jest.spyOn(globalThis, 'fetch');
    try {
      const { source, http } = build({
        fetch: jest
          .fn()
          .mockRejectedValue(new BlockedRequestError('themes.internal.test', 'a loopback address')),
      });

      await expect(source.refresh(CONTEXT)).resolves.toBeNull();
      expect(http.logRefusal).toHaveBeenCalled();
      // The guard is not the guard if there is a second way out of the process.
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalFetch.mockRestore();
    }
  });

  /**
   * The claim is "the same schema", so the check is a comparison rather than a second list of
   * examples: whatever `PATCH /admin/branding` would refuse in a theme, this source refuses too.
   */
  it('validation: accepts exactly what an administrator’s own edit would be allowed to save', async () => {
    const documents: unknown[] = [
      { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: '#112233' } },
      { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: 'red' } },
      { version: THEME_DOCUMENT_VERSION, radius: { md: '6' } },
      {
        version: THEME_DOCUMENT_VERSION,
        typography: { fontSans: 'url(https://evil.test/f.woff)' },
      },
      { version: THEME_DOCUMENT_VERSION, motion: { fast: '1ms' } },
      { version: THEME_DOCUMENT_VERSION + 1, colors: {} },
      { colors: { brandPrimary: '#112233' } },
    ];

    for (const document of documents) {
      const { source } = build({ fetch: jest.fn().mockResolvedValue(jsonResponse(document)) });
      const acceptedHere = (await source.refresh(CONTEXT)) !== null;
      const acceptedFromAnAdministrator = brandingUpdateSchema.safeParse({
        theme: document,
      }).success;
      expect([document, acceptedHere]).toEqual([document, acceptedFromAnAdministrator]);
    }
  });

  it('response-cap: asks for at most 64 KB rather than the transport’s 5 MB default', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(DOCUMENT));
    const { source } = build({ fetch: fetchMock });

    await source.refresh(CONTEXT);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestOptions];
    expect(init.maxBytes).toBe(64 * 1024);
  });

  it('cache: serves the last good document without asking again, and after a failure', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(DOCUMENT))
      .mockResolvedValue(jsonResponse({ message: 'gone' }, 503));
    const { source } = build({ fetch: fetchMock });

    await source.refresh(CONTEXT);
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await source.refresh(CONTEXT);
    await expect(source.load(CONTEXT)).resolves.toEqual(DOCUMENT);
  });

  it('fallback: hands the caller null instead of an error when there is nothing to serve', async () => {
    const { source } = build({ fetch: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    // Null is what makes the ladder work: `BrandingService` then falls through to the stored
    // branding and then to the built-in theme, which is asserted in `branding.service.spec.ts`.
    await expect(source.load(CONTEXT)).resolves.toBeNull();
    await expect(source.refresh(CONTEXT)).resolves.toBeNull();
    await source.onModuleDestroy();
  });
});

describe('RemoteThemeSource.readiness', () => {
  it('is unhealthy with no document, and names the vendor half as missing', async () => {
    const { source } = build({ account: null });
    const readiness = await source.readiness(CONTEXT);

    expect(readiness.source).toBe('remote');
    expect(readiness.healthy).toBe(false);
    expect(readiness.lastDocumentAt).toBeNull();
    expect(readiness.missing.map((item) => item.key)).toEqual(
      expect.arrayContaining(['connection', 'document-endpoint', 'integration-direction']),
    );
    expect(readiness.ready.length).toBeGreaterThan(0);
  });

  it('names the missing document path ahead of everything else once a base URL exists', async () => {
    const { source } = build({ account: { ...ACCOUNT, documentPath: null } });
    const readiness = await source.readiness(CONTEXT);
    expect(readiness.missing[0]?.key).toBe('document-path');
  });

  it('reports healthy only once a document has actually been served', async () => {
    const { source } = build({ fetch: jest.fn().mockResolvedValue(jsonResponse(DOCUMENT)) });

    expect((await source.readiness(CONTEXT)).healthy).toBe(false);
    await source.refresh(CONTEXT);
    const readiness = await source.readiness(CONTEXT);
    expect(readiness.healthy).toBe(true);
    expect(readiness.lastDocumentAt).not.toBeNull();
    // Still not "done": the contract questions are open whether or not a document arrived.
    expect(readiness.missing.length).toBeGreaterThan(0);
  });
});
