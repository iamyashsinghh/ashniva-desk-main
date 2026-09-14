import { Injectable } from '@nestjs/common';
import {
  CONVERSATION_KIND,
  CONVERSATION_MEMBER_ROLE,
  MAX_GROUP_MEMBERS,
  PROJECT_MEMBER_ROLE,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { anchorKeyFor } from './communication.mapper';
import { ConversationMembersRepository } from './conversation-members.repository';
import { ConversationsRepository } from './conversations.repository';

/**
 * One group chat per project, named after the project, holding its team.
 *
 * Membership is the project's internal members plus the org team linked to it. Chats lists the
 * group so everybody on that work sees the same thread; adding or removing people on the project
 * (or on the linked team) is what changes who receives the next message.
 */
@Injectable()
export class ProjectTeamGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsRepository,
    private readonly members: ConversationMembersRepository,
  ) {}

  /** Create the group if it is missing, and keep its name and members in line with the project. */
  async sync(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        name: true,
        organizationId: true,
        managerUserId: true,
        leadUserId: true,
        createdById: true,
        members: { select: { userId: true, role: true } },
        team: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!project) {
      return;
    }

    const desired = new Set<string>();
    for (const member of project.members) {
      if (member.role !== PROJECT_MEMBER_ROLE.CLIENT_CONTACT) {
        desired.add(member.userId);
      }
    }
    if (project.managerUserId) {
      desired.add(project.managerUserId);
    }
    if (project.leadUserId) {
      desired.add(project.leadUserId);
    }
    if (project.team) {
      for (const member of project.team.members) {
        desired.add(member.userId);
      }
    }

    const ownerId = project.managerUserId ?? project.createdById;
    if (ownerId) {
      desired.add(ownerId);
    }
    const memberIds = [...desired].slice(0, MAX_GROUP_MEMBERS);
    if (memberIds.length === 0 || !ownerId) {
      return;
    }

    const anchorKey = anchorKeyFor({
      kind: CONVERSATION_KIND.GROUP,
      directKey: `PROJECT:${project.id}`,
    });
    let row = await this.conversations.findByAnchor(project.organizationId, anchorKey);
    if (!row) {
      row = await this.conversations.create({
        organizationId: project.organizationId,
        projectId: null,
        kind: CONVERSATION_KIND.GROUP,
        title: project.name,
        imageFileId: null,
        anchorKey,
        createdById: ownerId,
      });
      if (!row) {
        row = await this.conversations.findByAnchor(project.organizationId, anchorKey);
      }
    } else if (row.title !== project.name) {
      row = await this.conversations.updateConversation(row.id, { title: project.name });
    }
    if (!row) {
      return;
    }

    await this.members.ensureMember(project.organizationId, row.id, ownerId, {
      role: CONVERSATION_MEMBER_ROLE.OWNER,
      rejoin: true,
    });
    for (const userId of memberIds) {
      if (userId === ownerId) {
        continue;
      }
      await this.members.ensureMember(project.organizationId, row.id, userId, {
        addedById: ownerId,
        rejoin: true,
      });
    }

    const present = await this.prisma.conversationMember.findMany({
      where: { conversationId: row.id, leftAt: null },
      select: { userId: true },
    });
    const wanted = new Set(memberIds);
    for (const member of present) {
      if (!wanted.has(member.userId)) {
        await this.members.markMemberLeft(row.id, member.userId);
      }
    }
  }

  /** Create the group only when this project does not already have one. */
  async ensure(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { organizationId: true },
    });
    if (!project) {
      return;
    }
    const existing = await this.conversations.findByAnchor(
      project.organizationId,
      anchorKeyFor({ kind: CONVERSATION_KIND.GROUP, directKey: `PROJECT:${projectId}` }),
    );
    if (!existing) {
      await this.sync(projectId);
    }
  }

  async ensureMany(projectIds: readonly string[]): Promise<void> {
    for (const projectId of projectIds) {
      await this.ensure(projectId);
    }
  }

  async syncByTeamId(teamId: string): Promise<void> {
    const projects = await this.prisma.project.findMany({
      where: { teamId, deletedAt: null },
      select: { id: true },
    });
    for (const project of projects) {
      await this.sync(project.id);
    }
  }
}
