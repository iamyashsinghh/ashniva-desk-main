import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';

/** The work an invoice may point at. Any of them may be absent. */
export interface InvoiceLinks {
  projectId?: string | null | undefined;
  contractId?: string | null | undefined;
  milestoneId?: string | null | undefined;
  changeRequestId?: string | null | undefined;
}

type LinkReader = Pick<PrismaService, 'project' | 'contract' | 'milestone' | 'changeRequest'>;

/**
 * Every linked record must be this provider's and belong to the invoice's client.
 *
 * Row-level security keeps other *tenants* out, but all of a provider's clients share one tenant,
 * so without this an invoice to one client could name another client's project, and its name
 * would reach the first client on the invoice they are sent. A milestone has no client of its own,
 * so it is judged by its project. The same message for "does not exist" and "is someone else's"
 * so the answer does not confirm another client's record id.
 */
export async function assertInvoiceLinks(
  prisma: LinkReader,
  organizationId: string,
  clientOrganizationId: string,
  links: InvoiceLinks,
): Promise<void> {
  const live = { organizationId, deletedAt: null };
  const checks: Promise<unknown>[] = [];

  if (links.projectId) {
    checks.push(
      prisma.project
        .findFirst({
          where: { ...live, id: links.projectId, clientOrganizationId },
          select: { id: true },
        })
        .then((row) => row ?? refuse('project')),
    );
  }
  if (links.contractId) {
    checks.push(
      prisma.contract
        .findFirst({
          where: { ...live, id: links.contractId, clientOrganizationId },
          select: { id: true },
        })
        .then((row) => row ?? refuse('contract')),
    );
  }
  if (links.milestoneId) {
    checks.push(
      prisma.milestone
        .findFirst({
          where: { ...live, id: links.milestoneId, project: { clientOrganizationId } },
          select: { id: true },
        })
        .then((row) => row ?? refuse('milestone')),
    );
  }
  if (links.changeRequestId) {
    checks.push(
      prisma.changeRequest
        .findFirst({
          where: { ...live, id: links.changeRequestId, clientOrganizationId },
          select: { id: true },
        })
        .then((row) => row ?? refuse('change request')),
    );
  }

  await Promise.all(checks);
}

function refuse(kind: string): never {
  throw new BadRequestException(`That ${kind} does not belong to this invoice's client`);
}
