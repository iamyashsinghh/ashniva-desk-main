import type { IvrReadiness } from '@ashniva/types';

/**
 * Boundary between Ashniva Desk and any IVR/telephony provider (Tata first, others later).
 * The API never dials directly: every call is bridged by the provider so neither party's
 * personal number is exposed. Implementations live in ./providers and are selected by
 * `IVR_PROVIDER`; their credentials and webhook secret are per tenant, in the tenant's IVR
 * integration connection, encrypted at rest.
 *
 * Nothing above this boundary knows a provider's name. `CallsService` asks for a call to be
 * placed and is handed a `providerCallId`; swapping Tata for somebody else is a new file in
 * ./providers and a changed environment variable, not an edit to any ticket or call service.
 */
export interface IvrOutboundCallRequest {
  organizationId: string;
  ticketId: string;
  /** Internal user who will be connected first. */
  agentUserId: string;
  /** Hashed/masked reference to the client's registered number, never the raw number. */
  clientPhoneRef: string;
  /** Whether the client consented to recording (asked by the IVR before bridging). */
  recordingConsent: boolean;
  /**
   * The provider account the call is placed on, from the tenant's integration connection.
   *
   * Passed rather than looked up so the adapter stays a pure translator: it holds no tenant
   * state, which is what makes one instance safe to share across every organization.
   */
  account: IvrProviderAccount;
}

/** One tenant's credentials for a provider, resolved and decrypted by the caller. */
export interface IvrProviderAccount {
  /** The provider's own identifier for the account. Also what attributes an inbound webhook. */
  externalAccountId: string;
  /** The decrypted API credential. Never logged, never audited, never returned in a response. */
  credential: string | null;
  /**
   * Where the provider's API lives, from the connection's non-secret settings.
   *
   * Here rather than in the environment because it is a per-tenant fact: telephony vendors run
   * regional hosts, and two organizations on the same Desk installation can legitimately be on
   * different ones. Null when nobody has configured it, which is one of the things
   * `readiness()` reports rather than discovering at dial time.
   */
  baseUrl: string | null;
}

/**
 * The account to pass when a tenant has none configured.
 *
 * One constant rather than the literal repeated at each call site, which is what it was until
 * adding a field to the account meant editing four unrelated services. An adapter is expected to
 * refuse this — the empty account is how "nothing is configured" reaches it, and refusing is the
 * honest answer.
 *
 * Frozen, and typed `Readonly`, because collapsing four independent literals into one object also
 * created a singleton shared by every tenant's call path. A later adapter writing something that
 * looks defensive — `account.baseUrl ??= this.defaultHost` — would make the first unconfigured
 * tenant's value stick for every tenant afterwards, including ones in another region. `Readonly`
 * makes that a compile error and `Object.freeze` makes it throw if it ever gets past one.
 */
export const UNCONFIGURED_IVR_ACCOUNT: Readonly<IvrProviderAccount> = Object.freeze({
  externalAccountId: '',
  credential: null,
  baseUrl: null,
});

export interface IvrOutboundCallResult {
  providerCallId: string;
  startedAt: Date;
}

export interface IvrWebhookVerification {
  /** True when the payload signature matches the provider's webhook secret. */
  valid: boolean;
  /** Provider-side delivery id used for idempotency. */
  deliveryId: string | undefined;
}

export type IvrCallEventType =
  'call.started' | 'call.answered' | 'call.no_answer' | 'call.ended' | 'recording.ready';

export interface IvrCallEvent {
  type: IvrCallEventType;
  providerCallId: string;
  occurredAt: Date;
  durationSeconds?: number;
  recordingRef?: string;
  /** The provider's own word for how the call ended, when it gives one. */
  disposition?: string;
  /** Raw provider payload, stored for troubleshooting (secrets stripped). */
  raw: unknown;
}

export interface IvrProvider {
  readonly key: 'TATA' | 'OTHER';
  startOutboundCall(request: IvrOutboundCallRequest): Promise<IvrOutboundCallResult>;
  transferCall(providerCallId: string, toAgentUserId: string): Promise<void>;
  endCall(providerCallId: string): Promise<void>;
  /**
   * Whether this delivery really came from the provider.
   *
   * The secret is passed in rather than read here: which secret applies depends on which tenant
   * the delivery belongs to, and that is decided by the caller from a server-side mapping. The
   * adapter's job is only to know the *scheme* — which header carries the signature and how it
   * is computed — because that is the part that differs between providers.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
  ): IvrWebhookVerification;
  /**
   * Which account a delivery claims to be for, read from the payload.
   *
   * A claim, not a fact: it selects which secrets to try, and the signature is what proves it.
   * Returns null when the payload names none, which is refused rather than guessed at.
   */
  accountIdFromPayload(payload: unknown): string | null;
  parseWebhookEvent(payload: unknown): IvrCallEvent;
  /**
   * Turns a stored recording reference into something playable, briefly.
   *
   * The audio stays with the provider. Desk holds a reference and asks for a short-lived URL each
   * time somebody is allowed to listen, so there is one copy of a recording in the world rather
   * than two, and it stays where the retention policy that governs it already applies.
   */
  recordingUrl(
    recordingRef: string,
    account: IvrProviderAccount,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }>;
  /**
   * Whether this adapter could place a real call, and what is missing when it could not.
   *
   * Deliberately richer than a boolean. An adapter that cannot dial is usually waiting on
   * something specific — a vendor endpoint, an authentication scheme, a directory mapping — and
   * the person who can obtain it is reading this answer on a screen. `IvrReadiness.missing` is
   * that shopping list; see `docs/ivr-provider-contract.md` for the long form.
   */
  readiness(account: IvrProviderAccount | null): Promise<Omit<IvrReadiness, 'provider'>>;
}

export const IVR_PROVIDER = Symbol('IVR_PROVIDER');
