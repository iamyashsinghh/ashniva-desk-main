/**
 * How the SDK reaches Desk.
 *
 * An interface rather than a bare `fetch` call, for two reasons that matter to a host application:
 * a customer whose page already has an instrumented HTTP client can hand it in, and the SDK's own
 * tests can run without a network. The default is `fetch`, which every browser the SDK supports
 * has had for years.
 */

export interface SupportRequest {
  method: 'GET' | 'POST';
  path: string;
  token: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface SupportResponse {
  status: number;
  body: unknown;
}

export interface SupportTransport {
  send(request: SupportRequest): Promise<SupportResponse>;
}

/**
 * Why a call did not succeed.
 *
 * `status` is absent when nothing came back at all — the browser is offline, the page was closed
 * mid-flight, or the origin was refused by CORS. The widget shows its unavailable state for that
 * case, which is a different message from "support said no".
 */
export class SupportRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'SupportRequestError';
  }

  /** True when trying again later could plausibly work. */
  get retryable(): boolean {
    if (this.status === undefined) {
      return true;
    }
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/**
 * The default transport.
 *
 * `credentials: 'omit'` deliberately. The widget authenticates with a bearer token and needs no
 * cookie, and the API refuses to reflect a widget origin with credentials — asking for them here
 * would turn every call into a CORS failure that looks like an outage.
 */
export function fetchTransport(baseUrl: string): SupportTransport {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    async send(request: SupportRequest): Promise<SupportResponse> {
      let response: Response;
      try {
        response = await fetch(`${root}${request.path}`, {
          method: request.method,
          credentials: 'omit',
          mode: 'cors',
          headers: {
            authorization: `Bearer ${request.token}`,
            ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...request.headers,
          },
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
          ...(request.signal ? { signal: request.signal } : {}),
        });
      } catch (error) {
        throw new SupportRequestError(
          'Support could not be reached',
          undefined,
          error instanceof Error ? error.message : error,
        );
      }
      const text = await response.text();
      let body: unknown = null;
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      return { status: response.status, body };
    },
  };
}
