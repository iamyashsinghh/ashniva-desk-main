import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, Visibility } from '../../generated/prisma/client';

const commentInclude = {
  author: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CommentInclude;

export type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

export interface CreateCommentInput {
  organizationId: string;
  authorId: string;
  body: string;
  visibility: Visibility;
  taskId?: string;
  ticketId?: string;
  changeRequestId?: string;
}

/** Comments on tasks, tickets and change requests (exactly one parent, enforced by the database). */
@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateCommentInput): Promise<CommentRow> {
    return this.prisma.comment.create({ data: input, include: commentInclude });
  }

  listForTask(taskId: string, visibility?: Visibility): Promise<CommentRow[]> {
    return this.prisma.comment.findMany({
      where: { taskId, deletedAt: null, ...(visibility ? { visibility } : {}) },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  listForTicket(ticketId: string, visibility?: Visibility): Promise<CommentRow[]> {
    return this.prisma.comment.findMany({
      where: { ticketId, deletedAt: null, ...(visibility ? { visibility } : {}) },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
  }
}
