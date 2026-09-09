import { BadRequestException, Injectable } from '@nestjs/common';
import { isClientFacingSummary, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { CreateSummaryInput } from './ai-summaries.service';

/**
 * The lookups that decide what a summary is allowed to be about.
 *
 * Separate from the workflow service because these are all the same shape — does this row exist,
 * in this tenant — and a caller that skips one of them is exactly how a summary ends up scoped to
 * another organization's project.
 */
@Injectable()
export class SummaryScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Which client, if any, this summary is for.
   *
   * An internal summary type never gets one, whatever the caller asked for: that is what makes
   * "this is internal" a property of the row rather than a promise about how it is used.
   */
  async resolveClient(actor: AuthenticatedUser, input: CreateSummaryInput): Promise<string | null> {
    if (!isClientFacingSummary(input.type)) {
      return null;
    }
    const clientId =
      input.clientOrganizationId ??
      (input.projectId
        ? (
            await this.prisma.project.findFirst({
              where: {
                id: input.projectId,
                organizationId: actor.organizationId,
                deletedAt: null,
              },
              select: { clientOrganizationId: true },
            })
          )?.clientOrganizationId
        : undefined);

    if (!clientId) {
      throw new BadRequestException(
        'A client-facing summary needs a client organization, or a project that has one',
      );
    }

    const client = await this.prisma.organization.findFirst({
      where: { id: clientId, deletedAt: null, isServiceProvider: false },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('That client organization does not exist');
    }
    return client.id;
  }

  /** A project, user or ticket named on a summary must belong to the caller's tenant. */
  async assertScopeBelongs(actor: AuthenticatedUser, input: CreateSummaryInput) {
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: input.projectId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException('That project does not exist');
      }
    }
    if (input.subjectUserId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: input.subjectUserId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!membership) {
        throw new BadRequestException('That person is not in this organization');
      }
    }
    if (input.ticketId) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: input.ticketId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!ticket) {
        throw new BadRequestException('That ticket does not exist');
      }
    }
  }
}
