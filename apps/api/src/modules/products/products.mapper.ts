import type {
  Priority,
  ProductCredentialSummary,
  ProductDetail,
  ProductSummary,
  SupportTier,
  TicketSource,
  TicketType,
} from '@ashniva/types';

import type { AuthenticatedProduct } from './product-context';
import type { CredentialRow, ProductContextRow, ProductRow } from './products.repository';

/**
 * Rows into API shapes.
 *
 * `secretHash` is not mapped anywhere in this file, and there is no shape it could be mapped
 * into: `ProductCredentialSummary` has no field for it. That is the point — the secret cannot
 * leak through a DTO because there is nowhere for it to go.
 */
export function toCredentialSummary(row: CredentialRow): ProductCredentialSummary {
  return {
    id: row.id,
    keyId: row.keyId,
    label: row.label,
    isActive: row.isActive && row.revokedAt === null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * One product row into the context every authenticated external caller is resolved to.
 *
 * Shared by the machine credential guard and the widget guard on purpose. Two builders would be
 * two places for "which client organization owns this product's tickets" to be answered, and the
 * day they disagreed one of them would be routing tickets into the wrong tenant.
 */
export function toAuthenticatedProduct(
  row: ProductContextRow,
  credential: { credentialId: string | null; credentialKeyId: string },
): AuthenticatedProduct {
  return {
    productId: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    projectId: row.projectId,
    // An internal product has no client organization of its own; its tickets belong to the
    // provider, which is what Phase 1 already does for internally raised tickets.
    clientOrganizationId: row.project?.clientOrganizationId ?? row.organizationId,
    supportRequesterId: row.supportRequesterId,
    supportEnabled: row.supportEnabled,
    autoRouteEnabled: row.autoRouteEnabled,
    ivrEnabled: row.ivrEnabled,
    supportTier: row.supportTier as SupportTier,
    allowedSources: row.allowedSources as TicketSource[],
    allowedWorkAreas: row.allowedWorkAreas,
    defaultPriority: row.defaultPriority as Priority,
    defaultType: row.defaultType as TicketType,
    allowedOrigins: row.allowedOrigins,
    ...credential,
  };
}

export function toProductSummary(row: ProductRow, openTickets = 0): ProductSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    supportEnabled: row.supportEnabled,
    autoRouteEnabled: row.autoRouteEnabled,
    ivrEnabled: row.ivrEnabled,
    supportTier: row.supportTier as SupportTier,
    project: row.project
      ? { id: row.project.id, code: row.project.code, name: row.project.name }
      : null,
    activeCredentials: row.credentials.filter((entry) => entry.isActive && entry.revokedAt === null)
      .length,
    openTickets,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProductDetail(row: ProductRow, openTickets = 0): ProductDetail {
  return {
    ...toProductSummary(row, openTickets),
    allowedSources: row.allowedSources as TicketSource[],
    allowedWorkAreas: row.allowedWorkAreas,
    allowedOrigins: row.allowedOrigins,
    defaultPriority: row.defaultPriority as Priority,
    defaultType: row.defaultType as TicketType,
    supportRequester: row.supportRequester,
    credentials: row.credentials.map(toCredentialSummary),
    createdAt: row.createdAt.toISOString(),
  };
}
