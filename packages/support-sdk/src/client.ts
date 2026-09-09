import {
  SDK_INTERFACE_VERSION,
  type IssueInput,
  type SupportCapabilities,
  type SupportSession,
  type TicketReference,
  type TicketStatus,
} from './contract';
import { fetchTransport, SupportRequestError, type SupportTransport } from './transport';
import { validateIssue, type SupportValidationError } from './validation';

/**
 * How the host application gets a session.
 *
 * A function rather than a token, and this is the single most important line of the SDK's public
 * shape. A token is minted by the customer's *backend* from a credential the browser must never
 * see, and it expires in minutes — so the SDK has to be able to ask for a new one, which means the
 * host has to give it a way to ask. Accepting a bare token instead would push every integrator
 * towards embedding a long-lived secret in their page, which is the exact failure this design
 * exists to prevent.
 */
export type SessionProvider = () => Promise<SupportSession> | SupportSession;

export interface SupportClientOptions {
  /** Where Desk lives, e.g. `https://desk.example.com/api/v1`. */
  baseUrl: string;
  /** Asks the host application's backend for a fresh session. */
  session: SessionProvider;
  /** Swap the HTTP layer, for an instrumented client or for a test. */
  transport?: SupportTransport;
  /** Re-mint this many seconds before a session actually expires. */
  refreshLeadSeconds?: number;
}

/** Default lead. Long enough that a slow upload does not finish after its token has died. */
const DEFAULT_REFRESH_LEAD_SECONDS = 60;

/**
 * The support client: everything a widget does, with no opinion about how it looks.
 *
 * Deliberately not coupled to any Ashniva product. It knows about a base URL, a way to get a
 * session, and the shapes in `contract.ts` — nothing about Carelix, Irista or Desk's own screens.
 * A customer's own application is as much a first-class host as ours is.
 *
 * Every method that needs a session gets one through `withSession`, which re-mints when the
 * current one is close to expiry and once more if the server rejects the token anyway. A widget
 * that has been open on a tab for an hour therefore still works, without the host writing any
 * refresh logic of its own.
 */
export class SupportClient {
  readonly version = SDK_INTERFACE_VERSION;

  private readonly transport: SupportTransport;
  private readonly refreshLeadSeconds: number;
  private current: SupportSession | null = null;
  private pending: Promise<SupportSession> | null = null;

  constructor(private readonly options: SupportClientOptions) {
    this.transport = options.transport ?? fetchTransport(options.baseUrl);
    this.refreshLeadSeconds = options.refreshLeadSeconds ?? DEFAULT_REFRESH_LEAD_SECONDS;
  }

  /** What this product's support currently offers. Read it before rendering any control. */
  capabilities(signal?: AbortSignal): Promise<SupportCapabilities> {
    return this.withSession((token) =>
      this.call<SupportCapabilities>({
        method: 'GET',
        path: '/support/widget/config',
        token,
        signal,
      }),
    );
  }

  /**
   * Files an issue.
   *
   * Validated here first, so a reporter is told about a too-long description before a ten-megabyte
   * screenshot is uploaded. The server validates it all again and is what actually decides.
   *
   * `idempotencyKey` makes a retry safe: the same key returns the same ticket rather than making a
   * second one. A widget that retries after a dropped connection should always send one.
   */
  async submitIssue(
    input: IssueInput,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<TicketReference> {
    const problems = validateIssue(input);
    if (problems.length > 0) {
      throw problems[0] as SupportValidationError;
    }
    const body = {
      title: input.subject.trim(),
      description: input.description.trim(),
      ...(input.category ? { module: input.category } : {}),
      ...(input.context ? { context: input.context } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };
    return this.withSession((token) =>
      this.call<TicketReference>({
        method: 'POST',
        path: '/support/widget/tickets',
        token,
        body,
        ...(options.idempotencyKey
          ? { headers: { 'idempotency-key': options.idempotencyKey } }
          : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    );
  }

  /** The client-safe status of a ticket this product raised. Never internal detail. */
  ticketStatus(ticketId: string, signal?: AbortSignal): Promise<TicketStatus> {
    return this.withSession((token) =>
      this.call<TicketStatus>({
        method: 'GET',
        path: `/support/widget/tickets/${encodeURIComponent(ticketId)}`,
        token,
        signal,
      }),
    );
  }

  /**
   * Whether "Call support" should be offered, and the sentence to show when it should not.
   *
   * Resolved from the product and its support tier on the server, so switching calls off in Desk
   * disables the control in every embedded copy without the host redeploying.
   */
  async callAvailability(
    signal?: AbortSignal,
  ): Promise<{ enabled: boolean; reason: string | null }> {
    const capabilities = await this.capabilities(signal);
    return {
      enabled: capabilities.canRequestCall,
      reason: capabilities.callUnavailableReason,
    };
  }

  /** Drops the cached session, so the next call mints a fresh one. */
  reset(): void {
    this.current = null;
    this.pending = null;
  }

  /**
   * Runs one call with a valid session, re-minting once if the server rejects the token anyway.
   *
   * The second attempt matters more than it looks: a session can be invalidated between being
   * minted and being used — the credential was rotated, support was switched off, the origin was
   * removed — and a widget that gave up on the first 401 would stay broken until the page was
   * reloaded. One retry, never a loop: if a freshly minted token is also refused, the answer is no.
   */
  private async withSession<T>(run: (token: string) => Promise<T>): Promise<T> {
    const session = await this.session();
    try {
      return await run(session.token);
    } catch (error) {
      if (!(error instanceof SupportRequestError) || error.status !== 401) {
        throw error;
      }
      this.reset();
      const retry = await this.session();
      return run(retry.token);
    }
  }

  /** The current session, minting one when there is none or it is about to expire. */
  private async session(): Promise<SupportSession> {
    if (this.current && !this.expiringSoon(this.current)) {
      return this.current;
    }
    // One in-flight mint at a time. Without this, opening a widget that reads capabilities and a
    // ticket status at once would ask the host's backend for two sessions.
    if (!this.pending) {
      this.pending = Promise.resolve(this.options.session())
        .then((session) => {
          this.current = session;
          return session;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  private expiringSoon(session: SupportSession, now = Date.now()): boolean {
    const expiry = Date.parse(session.expiresAt);
    if (Number.isNaN(expiry)) {
      // An unreadable expiry is treated as expired: minting again costs one call, and using a
      // token whose lifetime is unknown costs a failed submission the reporter has to repeat.
      return true;
    }
    return expiry - now <= this.refreshLeadSeconds * 1000;
  }

  private async call<T>(request: Parameters<SupportTransport['send']>[0]): Promise<T> {
    const response = await this.transport.send(request);
    if (response.status >= 200 && response.status < 300) {
      return response.body as T;
    }
    throw new SupportRequestError(
      messageFor(response.status, response.body),
      response.status,
      response.body,
    );
  }
}

/** The server's own words where it gave any, and something honest where it did not. */
function messageFor(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  if (status === 401) {
    return 'This support session is no longer valid';
  }
  return `Support answered ${status}`;
}
