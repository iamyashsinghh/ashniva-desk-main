import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, Visibility } from '../../generated/prisma/client';

const fileInclude = {
  uploadedBy: { select: { id: true, name: true, email: true } },
  task: { select: { id: true, project: { select: { clientOrganizationId: true } } } },
  ticket: { select: { id: true, clientOrganizationId: true } },
  project: { select: { id: true, clientOrganizationId: true } },
  contract: { select: { id: true, clientOrganizationId: true } },
  milestone: {
    select: { id: true, clientVisible: true, project: { select: { clientOrganizationId: true } } },
  },
  changeRequest: { select: { id: true, clientOrganizationId: true } },
  approval: { select: { id: true, clientOrganizationId: true } },
  // An invoice PDF has no parent column — the link runs the other way, from `Invoice.pdfFileId`.
  // Without this the file looks parentless and a client is refused their own invoice.
  //
  // `status` and `deletedAt` come along because the link alone is not authority to read: an
  // invoice can be cancelled or soft-deleted and still point at its document.
  invoicePdfs: {
    select: { id: true, clientOrganizationId: true, status: true, deletedAt: true },
  },
  // The provider's record of a document that has been superseded or withdrawn. Never a read
  // grant for a client — it is here only so the delete guard can see that the file is still
  // somebody's evidence.
  invoiceHistoryPdfs: { select: { id: true } },
} satisfies Prisma.FileInclude;

export type FileRow = Prisma.FileGetPayload<{ include: typeof fileInclude }>;

export interface CreateFileInput {
  organizationId: string;
  uploadedById: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  visibility: Visibility;
  taskId?: string;
  ticketId?: string;
  projectId?: string;
  contractId?: string;
  milestoneId?: string;
  changeRequestId?: string;
  approvalId?: string;
}

export interface ListFilesOptions {
  /** Narrows to one visibility; omitted means both. */
  visibility?: Visibility;
  /** Row ceiling. Omitted means unbounded, which only the portal's own filtered reads use. */
  take?: number;
  /** The caller's own row scope — a task's attachments follow the task's visibility. */
  scope?: Prisma.FileWhereInput;
}

export interface FileParentFilter {
  taskId?: string;
  ticketId?: string;
  projectId?: string;
  contractId?: string;
  milestoneId?: string;
  changeRequestId?: string;
  approvalId?: string;
}

@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateFileInput): Promise<FileRow> {
    return this.prisma.file.create({ data: input, include: fileInclude });
  }

  findById(
    organizationId: string,
    id: string,
    scope?: Prisma.FileWhereInput,
  ): Promise<FileRow | null> {
    return this.prisma.file.findFirst({
      where: { id, organizationId, deletedAt: null, ...(scope ? { AND: scope } : {}) },
      include: fileInclude,
    });
  }

  list(
    organizationId: string,
    parent: FileParentFilter,
    options: ListFilesOptions = {},
  ): Promise<FileRow[]> {
    return this.prisma.file.findMany({
      where: {
        ...(options.scope ? { AND: options.scope } : {}),
        organizationId,
        deletedAt: null,
        ...parent,
        ...(options.visibility ? { visibility: options.visibility } : {}),
      },
      include: fileInclude,
      orderBy: { createdAt: 'asc' },
      ...(options.take ? { take: options.take } : {}),
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.file.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
