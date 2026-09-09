import { Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { BillingRepository, type ClientBillingProfileRow } from './billing.repository';
import type { SaveClientBillingProfileDto } from './dto/billing.dto';

/** What the audit entry records. Every field is printed on an invoice; none of them is a secret. */
function auditable(row: ClientBillingProfileRow) {
  return {
    clientOrganizationId: row.clientOrganizationId,
    legalName: row.legalName,
    address: [row.addressLine1, row.addressLine2, row.city, row.state, row.postalCode, row.country]
      .filter(Boolean)
      .join(', '),
    stateCode: row.stateCode,
    gstin: row.gstin,
  };
}

/**
 * The provider's record of how each client is invoiced — the "Bill to" block.
 *
 * Read every method here as belonging to the provider. `actor.organizationId` is the owner of the
 * row and the client id only ever narrows within it, so a client tenant reaching these methods
 * would be asking for rows it does not own and is given none. The route permissions keep a client
 * out well before that, and the row-level-security policy keeps them out if both were wrong.
 */
@Injectable()
export class ClientBillingProfileService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list(actor: AuthenticatedUser): Promise<ClientBillingProfileRow[]> {
    return this.repository.listClientProfiles(actor.organizationId);
  }

  get(
    actor: AuthenticatedUser,
    clientOrganizationId: string,
  ): Promise<ClientBillingProfileRow | null> {
    return this.repository.findClientProfile(actor.organizationId, clientOrganizationId);
  }

  async save(
    actor: AuthenticatedUser,
    clientOrganizationId: string,
    input: SaveClientBillingProfileDto,
  ): Promise<ClientBillingProfileRow> {
    await this.requireClientOrganization(actor, clientOrganizationId);
    const existing = await this.get(actor, clientOrganizationId);

    const row = await this.repository.upsertClientProfile(
      actor.organizationId,
      clientOrganizationId,
      {
        legalName: input.legalName.trim(),
        addressLine1: input.addressLine1.trim(),
        // A full replace, and the same rule as the provider's own profile: an absent key keeps
        // what is stored, a key sent blank clears it.
        addressLine2: kept(input.addressLine2, existing?.addressLine2),
        city: input.city.trim(),
        state: input.state.trim(),
        stateCode: input.stateCode,
        postalCode: input.postalCode.trim(),
        country: input.country?.trim() || existing?.country || 'India',
        gstin: kept(input.gstin, existing?.gstin),
      },
    );

    await this.auditLog.record({
      action: AUDIT_ACTION.CLIENT_BILLING_PROFILE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INVOICE,
      entityId: row.id,
      organizationId: actor.organizationId,
      before: existing ? auditable(existing) : undefined,
      after: auditable(row),
    });

    return row;
  }

  /**
   * The client must be a real organization that is not the provider itself.
   *
   * Without this a valid UUID would create a billing record for nobody, and the next invoice for
   * a client whose id was mistyped would print somebody else's name — a wrong recipient on a tax
   * document is the failure this table exists to prevent, not one to introduce.
   */
  private async requireClientOrganization(
    actor: AuthenticatedUser,
    clientOrganizationId: string,
  ): Promise<void> {
    if (clientOrganizationId === actor.organizationId) {
      throw new NotFoundException(
        'That is your own organization; your billing identity is the billing profile',
      );
    }
    const organization = await this.prisma.organization.findFirst({
      where: { id: clientOrganizationId, deletedAt: null, isServiceProvider: false },
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundException('No such client organization');
    }
  }
}

/** Absent keeps the stored value; present-but-blank clears it. */
function kept(incoming: string | undefined, stored: string | null | undefined): string | null {
  if (incoming === undefined) {
    return stored ?? null;
  }
  return incoming.trim() || null;
}
