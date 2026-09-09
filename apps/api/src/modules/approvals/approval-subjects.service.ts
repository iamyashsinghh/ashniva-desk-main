import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { APPROVAL_SUBJECT_TYPE, type ApprovalSubjectType } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { ApprovalSummaryRow } from './approvals.repository';

/** What an approval is about, resolved from the subject row so scope can never be spoofed. */
export interface ResolvedSubject {
  label: string;
  clientOrganizationId: string;
  projectId: string | null;
  contractId: string | null;
  changeRequestId: string | null;
}

/**
 * Looks up approval subjects. The client organization, project and contract of an approval are
 * always derived from the subject itself, never taken from the request body.
 */
@Injectable()
export class ApprovalSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    type: ApprovalSubjectType,
    id: string,
  ): Promise<ResolvedSubject> {
    const base = { id, organizationId, deletedAt: null };
    switch (type) {
      case APPROVAL_SUBJECT_TYPE.CLIENT_UPDATE: {
        const row = await this.prisma.clientUpdate.findFirst({ where: base });
        if (!row) {
          throw new NotFoundException('Client update not found');
        }
        return {
          label: row.title,
          clientOrganizationId: row.clientOrganizationId,
          projectId: row.projectId,
          contractId: null,
          changeRequestId: null,
        };
      }
      case APPROVAL_SUBJECT_TYPE.MILESTONE: {
        const row = await this.prisma.milestone.findFirst({
          where: base,
          include: { project: { select: { clientOrganizationId: true } } },
        });
        if (!row) {
          throw new NotFoundException('Milestone not found');
        }
        if (!row.project.clientOrganizationId) {
          throw new BadRequestException('The milestone belongs to a project without a client');
        }
        return {
          label: row.name,
          clientOrganizationId: row.project.clientOrganizationId,
          projectId: row.projectId,
          contractId: row.contractId,
          changeRequestId: row.changeRequestId,
        };
      }
      case APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST: {
        const row = await this.prisma.changeRequest.findFirst({ where: base });
        if (!row) {
          throw new NotFoundException('Change request not found');
        }
        return {
          label: `CR-${row.number} ${row.title}`,
          clientOrganizationId: row.clientOrganizationId,
          projectId: row.projectId,
          contractId: row.contractId,
          changeRequestId: row.id,
        };
      }
      case APPROVAL_SUBJECT_TYPE.CONTRACT_DOCUMENT:
      case APPROVAL_SUBJECT_TYPE.FILE:
        return this.resolveFile(organizationId, id, type);
      default:
        throw new BadRequestException('Unknown approval subject');
    }
  }

  /** Labels for a page of approvals, one query per subject type. */
  async labelsFor(rows: ApprovalSummaryRow[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const ids = (type: ApprovalSubjectType) =>
      rows.filter((row) => row.subjectType === type).map((row) => row.subjectId);
    const [updates, milestones, files] = await Promise.all([
      this.prisma.clientUpdate.findMany({
        where: { id: { in: ids('CLIENT_UPDATE') } },
        select: { id: true, title: true },
      }),
      this.prisma.milestone.findMany({
        where: { id: { in: ids('MILESTONE') } },
        select: { id: true, name: true },
      }),
      this.prisma.file.findMany({
        where: { id: { in: [...ids('CONTRACT_DOCUMENT'), ...ids('FILE')] } },
        select: { id: true, name: true },
      }),
    ]);
    updates.forEach((row) => labels.set(row.id, row.title));
    milestones.forEach((row) => labels.set(row.id, row.name));
    files.forEach((row) => labels.set(row.id, row.name));
    for (const row of rows) {
      if (row.subjectType === 'CHANGE_REQUEST' && row.changeRequest) {
        labels.set(row.subjectId, `CR-${row.changeRequest.number} ${row.changeRequest.title}`);
      }
      if (!labels.has(row.subjectId)) {
        labels.set(row.subjectId, row.title);
      }
    }
    return labels;
  }

  private async resolveFile(
    organizationId: string,
    id: string,
    type: ApprovalSubjectType,
  ): Promise<ResolvedSubject> {
    const file = await this.prisma.file.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        project: { select: { clientOrganizationId: true } },
        ticket: { select: { clientOrganizationId: true, projectId: true } },
        contract: { select: { clientOrganizationId: true, projectId: true } },
        milestone: {
          select: { projectId: true, project: { select: { clientOrganizationId: true } } },
        },
        changeRequest: {
          select: { clientOrganizationId: true, projectId: true, contractId: true },
        },
      },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (type === APPROVAL_SUBJECT_TYPE.CONTRACT_DOCUMENT && !file.contractId) {
      throw new BadRequestException('A contract document must be attached to a contract');
    }
    const clientOrganizationId =
      file.contract?.clientOrganizationId ??
      file.changeRequest?.clientOrganizationId ??
      file.project?.clientOrganizationId ??
      file.ticket?.clientOrganizationId ??
      file.milestone?.project.clientOrganizationId ??
      null;
    if (!clientOrganizationId) {
      throw new BadRequestException('The file is not attached to anything a client can see');
    }
    return {
      label: file.name,
      clientOrganizationId,
      projectId:
        file.projectId ??
        file.contract?.projectId ??
        file.changeRequest?.projectId ??
        file.ticket?.projectId ??
        file.milestone?.projectId ??
        null,
      contractId: file.contractId ?? file.changeRequest?.contractId ?? null,
      changeRequestId: file.changeRequestId,
    };
  }
}
