import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONVERSATION_KIND,
  isScopeKind,
  type AuthenticatedUser,
  type ConversationKind,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { CommunicationContext } from './communication-policy.service';
import { directKeyFor } from './communication.mapper';
import type { CreateConversationDto } from './dto/communication.dto';

/** The identity of a conversation: the one row the unique index is built on. */
export interface ConversationAnchorKey {
  /** Null only for the two scope kinds, which this service does not resolve. */
  projectId: string | null;
  kind: ConversationKind;
  taskId?: string | null;
  ticketId?: string | null;
  directKey?: string | null;
}

export interface ConversationAnchor {
  key: ConversationAnchorKey;
  context: CommunicationContext;
}

/**
 * Turns the four request shapes into one anchor.
 *
 * This is where a caller's identifiers stop being claims. A task id becomes the task's project; a
 * ticket id becomes the ticket's project; a direct conversation becomes a project both people are
 * on. Nothing downstream ever sees the caller's own idea of which project this is — which is the
 * whole reason this resolution is a step of its own rather than a few lines in a controller.
 *
 * It resolves; it does not authorize. The policy is asked afterwards, with the project this file
 * derived rather than the one the request named.
 */
@Injectable()
export class ConversationAnchorService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(actor: AuthenticatedUser, dto: CreateConversationDto): Promise<ConversationAnchor> {
    if (isScopeKind(dto.kind)) {
      // The scope kinds have their own endpoints, because starting one is a different act with a
      // different request shape: a group names several people and a title, and neither belongs in
      // a DTO whose every other field describes a project. Refused rather than half-supported.
      throw new BadRequestException(
        'Use POST /conversations/direct or POST /conversations/groups for a conversation with no project',
      );
    }
    if (dto.kind === CONVERSATION_KIND.TASK) {
      return this.taskAnchor(actor, dto.taskId);
    }
    if (dto.kind === CONVERSATION_KIND.TICKET) {
      return this.ticketAnchor(actor, dto.ticketId);
    }

    if (!dto.projectId) {
      throw new BadRequestException('A project is required');
    }
    const project = await this.prisma.project.count({
      where: { id: dto.projectId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (project === 0) {
      throw new NotFoundException('Project not found');
    }

    if (dto.kind === CONVERSATION_KIND.DIRECT) {
      if (!dto.withUserId || dto.withUserId === actor.userId) {
        throw new BadRequestException('A direct conversation needs one other person');
      }
      return {
        key: {
          projectId: dto.projectId,
          kind: CONVERSATION_KIND.DIRECT,
          directKey: directKeyFor(actor.userId, dto.withUserId),
        },
        context: { projectId: dto.projectId, withUserId: dto.withUserId },
      };
    }

    return {
      key: { projectId: dto.projectId, kind: CONVERSATION_KIND.PROJECT },
      context: { projectId: dto.projectId },
    };
  }

  private async taskAnchor(
    actor: AuthenticatedUser,
    taskId: string | undefined,
  ): Promise<ConversationAnchor> {
    if (!taskId) {
      throw new BadRequestException('A task conversation needs a task');
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return {
      key: { projectId: task.projectId, kind: CONVERSATION_KIND.TASK, taskId: task.id },
      context: { projectId: task.projectId, taskId: task.id },
    };
  }

  private async ticketAnchor(
    actor: AuthenticatedUser,
    ticketId: string | undefined,
  ): Promise<ConversationAnchor> {
    if (!ticketId) {
      throw new BadRequestException('A ticket conversation needs a ticket');
    }
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!ticket?.projectId) {
      // A ticket with no project has no team to derive a relationship from, so there is nobody
      // this conversation could admit. Refused rather than opened empty.
      throw new NotFoundException('Ticket not found, or not linked to a project');
    }
    return {
      key: { projectId: ticket.projectId, kind: CONVERSATION_KIND.TICKET, ticketId: ticket.id },
      context: { projectId: ticket.projectId, ticketId: ticket.id },
    };
  }
}
