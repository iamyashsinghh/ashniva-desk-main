/**
 * A registered product or application that may raise support tickets into Desk.
 *
 * Carelix, Irista, Ashniva HR, Ashniva IVR, and approved client software. A product is **not** a
 * project: the project is where the team, the ownership chain and the rotas live, and a product
 * points at one. Duplicating any of that here would give the router two places to look and two
 * chances to disagree.
 *
 * The registry exists so that an external system never has to say who it is beyond presenting a
 * credential. Everything that decides where a ticket goes — the organization, the project, the
 * support policy, the routing policy — is read from the product record rather than from the
 * request, because a caller that can name its own project can route itself anywhere.
 */

/**
 * How much support a product's users are entitled to.
 *
 * What each tier actually *does* is configuration, not code: see `SupportTierPolicy` in
 * `domain/support-tier-policy.ts`. Nothing here is priced, and nothing here should be — an
 * unconfigured tier behaves exactly as it did before that table existed.
 */
export const SUPPORT_TIER = {
  BASIC: 'BASIC',
  STANDARD: 'STANDARD',
  PRIORITY: 'PRIORITY',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type SupportTier = (typeof SUPPORT_TIER)[keyof typeof SUPPORT_TIER];

/** Every tier, in the order an administration screen should list them. */
export const ALL_SUPPORT_TIERS: readonly SupportTier[] = [
  SUPPORT_TIER.BASIC,
  SUPPORT_TIER.STANDARD,
  SUPPORT_TIER.PRIORITY,
  SUPPORT_TIER.ENTERPRISE,
];

export const SUPPORT_TIER_LABELS: Record<SupportTier, string> = {
  BASIC: 'Basic',
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
  ENTERPRISE: 'Enterprise',
};

/**
 * The prefix every machine credential carries.
 *
 * Not decoration. A secret that leaks into a log, a bug report or a paste is only actionable if
 * somebody can recognise it, and a fixed prefix is what makes `ask_` greppable across a codebase
 * and a log archive. It also tells the ingress guard immediately that it is looking at a machine
 * credential rather than a mistyped employee token.
 */
export const MACHINE_CREDENTIAL_PREFIX = 'ask';

/** How long a product code may be, and what it may contain. */
export const PRODUCT_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,23}$/;

/** The most metadata keys one ingress request may carry. */
export const MAX_INGRESS_METADATA_KEYS = 20;
/** The longest a single metadata value may be. */
export const MAX_INGRESS_METADATA_VALUE_LENGTH = 500;
/** The most attachments one ingress request may carry. */
export const MAX_INGRESS_ATTACHMENTS = 5;

/**
 * Splits a presented credential into its two halves.
 *
 * The key id is public and identifies which credential is being presented; the secret is what
 * proves it. Keeping the id in the token means the server can find the one hash to verify against
 * instead of trying every credential it holds — which is both slow and a timing oracle.
 */
export function parseMachineCredential(token: string): { keyId: string; secret: string } | null {
  const trimmed = token.trim();
  const prefix = `${MACHINE_CREDENTIAL_PREFIX}_`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const body = trimmed.slice(prefix.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    return null;
  }
  return { keyId: body.slice(0, dot), secret: body.slice(dot + 1) };
}

/** Assembles the one and only time a secret is ever shown in full. */
export function formatMachineCredential(keyId: string, secret: string): string {
  return `${MACHINE_CREDENTIAL_PREFIX}_${keyId}.${secret}`;
}
