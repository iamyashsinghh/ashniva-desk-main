import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import {
  BlockedDestinationError,
  SafeDestinationService,
  stripBrackets,
} from '../net/safe-destination.service';

/** Defaults chosen so a hostile or dead endpoint cannot hold a queue worker open. */
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface SafeRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Whole-request budget, connection and read together. */
  timeoutMs?: number;
  /** Refuse a response larger than this rather than buffering it. */
  maxBytes?: number;
  /** Plain HTTP, for an allow-listed internal host that has no certificate. */
  allowInsecure?: boolean;
}

/**
 * Raised when a URL is refused before any connection is made.
 *
 * Carries no part of the URL beyond its host, and never the request headers: the reason a request
 * was refused is worth logging, but the URL can carry a token in its query string and the headers
 * carry the credential outright.
 */
export class BlockedRequestError extends Error {
  constructor(
    readonly host: string,
    readonly detail: string,
  ) {
    super(`Refused to call ${host}: it resolves to ${detail}`);
    this.name = 'BlockedRequestError';
  }
}

/**
 * The one place the API opens an outbound HTTP connection to an address someone configured.
 *
 * Five features let an operator store a URL that the server then fetches — the two git providers'
 * self-hosted base URLs, the AI completion endpoint, the WhatsApp Cloud API base, and a test
 * account's data-reset hook. Without a check, each is a way to make the server issue requests
 * inside the network it is running in: to a database on the loopback interface, to another
 * tenant's service, or to the cloud metadata endpoint that hands out credentials to anyone who
 * asks. Being able to configure an integration should not be the same as being able to do that.
 *
 * **How the DNS rebinding window is closed.** `SafeDestinationService` resolves the name once,
 * checks every address it returns, and hands back one approved address; the socket is opened to
 * that address, with `Host` and the TLS server name carrying the original hostname so that virtual
 * hosting and certificate validation still work. There is no second resolution to poison. That
 * resolver is shared with the SMTP transport rather than reimplemented per protocol — see
 * `infrastructure/net/safe-destination.service.ts`.
 *
 * Redirects are followed by hand for the same reason: each hop is a new URL from an untrusted
 * source and goes through the whole check again. A public endpoint that redirects to
 * `169.254.169.254` is exactly the attack this defends against, and it is the reason
 * `redirect: 'follow'` is not good enough.
 */
@Injectable()
export class SafeHttpService {
  private readonly logger = new Logger(SafeHttpService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly destinations: SafeDestinationService,
  ) {}

  /**
   * Performs the request, returning a standard `Response` so callers read it as they always have.
   *
   * @throws BlockedRequestError when the destination, or any redirect hop, is not allowed.
   */
  async fetch(url: string, init: SafeRequestInit = {}): Promise<Response> {
    const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let target = url;
    let headers = init.headers;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const pinned = await this.resolveAndCheck(target, init.allowInsecure ?? false);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error('The request timed out');
      }

      const response = await this.send(pinned, { ...init, headers }, remaining);
      const location = response.headers.location;
      const isRedirect =
        response.statusCode !== undefined &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        typeof location === 'string';

      if (!isRedirect) {
        return toResponse(response, pinned.url, init.maxBytes ?? DEFAULT_MAX_BYTES);
      }

      // Drain the redirect body so the socket is released rather than left for the agent to reap.
      response.resume();
      const next = new URL(location, pinned.url);
      // A hop to another origin is a request to somebody the caller never chose to authenticate
      // to. The address rules above already refuse a private destination, but a public endpoint
      // that answers 302 to a host it controls would otherwise be handed the bearer token, and the
      // callback signature headers with it — a credential leak that needs no SSRF at all. The
      // headers survive a same-origin hop, which is what an ordinary `/x` → `/x/` looks like.
      if (next.origin !== pinned.url.origin) {
        headers = withoutCredentials(headers);
      }
      target = next.toString();
    }

    throw new Error(`The request was redirected more than ${MAX_REDIRECTS} times`);
  }

  /**
   * Decides whether a URL may be called, without calling it.
   *
   * Public so the rules can be tested for what they decide rather than only for what happens
   * afterwards, and so a caller that wants to validate operator input at the point it is saved
   * can reuse exactly the check the request will later apply.
   *
   * The allow-list is consulted first and matches on host, because the legitimate exception —
   * a self-hosted GitLab or a staging environment inside the operator's own network — is known by
   * name to the person deploying this, and by nothing else. `OUTBOUND_ALLOWED_HOSTS` governs HTTP
   * only; SMTP has its own list, so naming a mail relay does not also open it to the integrations.
   */
  async check(url: string, allowInsecure = false): Promise<void> {
    await this.resolveAndCheck(url, allowInsecure);
  }

  private async resolveAndCheck(url: string, allowInsecure: boolean): Promise<PinnedTarget> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BlockedRequestError('the configured endpoint', 'a URL that could not be parsed');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BlockedRequestError(parsed.host, `an unsupported scheme (${parsed.protocol})`);
    }
    // Plain HTTP would send the bearer token in clear text. It is allowed only where the caller
    // has said so *and* the host is one the deployment explicitly listed.
    const allowed = this.config.outbound.allowedHosts;
    const allowListed = allowed.includes(stripBrackets(parsed.hostname).toLowerCase());
    if (parsed.protocol === 'http:' && !(allowInsecure && allowListed)) {
      throw new BlockedRequestError(parsed.host, 'plain HTTP, which would expose the credential');
    }

    // The name-to-address decision, including the rebinding protection and the allow-list, belongs
    // to `SafeDestinationService` and is shared with the SMTP transport. What stays here is the
    // part that is genuinely about HTTP: the scheme, and the credential-in-clear rule above.
    try {
      const pinned = await this.destinations.resolve(parsed.hostname, allowed);
      return { url: parsed, address: pinned.address, family: pinned.family };
    } catch (error) {
      if (error instanceof BlockedDestinationError) {
        throw new BlockedRequestError(parsed.host, error.detail);
      }
      throw error;
    }
  }

  /** Opens the socket to the approved address, carrying the original name for Host and SNI. */
  private send(
    target: PinnedTarget,
    init: SafeRequestInit,
    timeoutMs: number,
  ): Promise<IncomingMessage> {
    const { url, address } = target;
    const secure = url.protocol === 'https:';
    const send = secure ? httpsRequest : httpRequest;
    const defaultPort = secure ? 443 : 80;
    // `fetch` sets Content-Length for a string body; `http.request` does not, and falls back to
    // `Transfer-Encoding: chunked`. Plenty of API gateways and WAFs in front of the endpoints this
    // calls refuse a chunked POST outright, so leaving it to Node would have quietly changed how
    // every outbound POST looks on the wire. Computed in bytes, not characters — a body with any
    // non-ASCII in it is longer than its `.length`.
    const body = init.body === undefined ? undefined : Buffer.from(init.body, 'utf8');

    return new Promise<IncomingMessage>((resolve, reject) => {
      const request = send(
        {
          host: address,
          port: url.port === '' ? defaultPort : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: init.method ?? 'GET',
          headers: {
            ...init.headers,
            ...(body ? { 'content-length': String(body.byteLength) } : {}),
            host: url.host,
          },
          // The certificate is checked against the name the caller asked for, not the address the
          // socket went to — otherwise pinning would break every TLS connection.
          ...(secure ? { servername: url.hostname } : {}),
          timeout: timeoutMs,
        },
        resolve,
      );
      request.on('timeout', () => {
        request.destroy(new Error('The request timed out'));
      });
      request.on('error', reject);
      if (body) {
        request.write(body);
      }
      request.end();
    });
  }

  /** Logs a refusal without the URL, which can carry a token in its query string. */
  logRefusal(error: BlockedRequestError, context: string): void {
    this.logger.warn(`${context}: refused an outbound request to ${error.host} — ${error.detail}`);
  }
}

/**
 * The headers minus anything that proves who the caller is.
 *
 * `authorization` is the obvious one; `x-ashniva-*` covers the outbound callback signature, which
 * is computed over this deployment's per-endpoint secret and is just as much a credential. Both
 * are matched case-insensitively, because a caller may spell a header name however it likes.
 */
function withoutCredentials(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return headers;
  }
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const lower = name.toLowerCase();
      return lower !== 'authorization' && !lower.startsWith('x-ashniva-');
    }),
  );
}

interface PinnedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/**
 * Buffers the response into a standard `Response`, refusing one that runs past the cap.
 *
 * The limit is enforced while reading rather than after it, so an endpoint that streams without
 * end costs a fixed amount of memory instead of all of it.
 */
async function toResponse(message: IncomingMessage, url: URL, maxBytes: number): Promise<Response> {
  const chunks: Buffer[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    message.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        message.destroy();
        reject(new Error(`The response was larger than ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    message.on('end', resolve);
    message.on('error', reject);
  });

  const headers = new Headers();
  for (const [key, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const status = message.statusCode ?? 502;
  // 204 and 304 may not carry a body, and `Response` throws if one is supplied.
  const body = status === 204 || status === 304 ? null : Buffer.concat(chunks);
  const response = new Response(body, { status, statusText: message.statusMessage, headers });
  Object.defineProperty(response, 'url', { value: url.toString() });
  return response;
}
