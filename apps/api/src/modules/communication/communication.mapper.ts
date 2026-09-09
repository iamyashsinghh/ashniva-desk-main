import {
  CONVERSATION_KIND,
  CONVERSATION_KIND_LABELS,
  PAIR_MEMBERSHIP_KINDS,
  type ConversationAbilities,
  type ConversationDetail,
  type ConversationKind,
  type ConversationMemberRole,
  type ConversationSummary,
  type MessageRevisionSummary,
  type MessageSummary,
  type MessageSystemKind,
  type ProjectMemberRole,
} from '@ashniva/types';
import { randomUUID } from 'node:crypto';

import { toMessageFileSummary } from './message-attachments';
import { messagePreview } from './message-preview';
import type { ConversationRow, MessageRevisionRow, MessageRow } from './conversations.repository';

/**
 * Rows into API shapes.
 *
 * There is no client shape in this file and no place to add one. An internal conversation has no
 * portal form: the controllers refuse a client, the socket refuses their subscription, and there
 * is no mapper that could serialise one for them. Making that possible would be a new, named
 * piece of work rather than a flag somebody flips.
 */

/**
 * The anchor, flattened into the one non-null string the unique index is built on.
 *
 * One function, used by the resolver that creates a conversation and by the lookup that finds an
 * existing one, so the two cannot disagree about what "the same thread" means.
 *
 * **Every key carries whatever makes it unique.** It used to be able to leave the project out,
 * because the index was `(project_id, anchor_key)` and the project was already in it. The index is
 * now `(organization_id, anchor_key)` — it had to be, because a nullable `project_id` makes a
 * unique index over it enforce nothing for the rows that leave it null — so a project channel and
 * a project-anchored direct conversation name their project here. `SCOPE_DIRECT` names neither a
 * project nor anything else: the pair is the whole identity, which is what makes it one thread per
 * pair for the organization rather than one per pair per shared project.
 */
export function anchorKeyFor(anchor: {
  kind: ConversationKind;
  projectId?: string | null;
  taskId?: string | null;
  ticketId?: string | null;
  directKey?: string | null;
}): string {
  switch (anchor.kind) {
    case CONVERSATION_KIND.TASK:
      return `TASK:${anchor.taskId ?? ''}`;
    case CONVERSATION_KIND.TICKET:
      return `TICKET:${anchor.ticketId ?? ''}`;
    case CONVERSATION_KIND.DIRECT:
      return `DIRECT:${anchor.projectId ?? ''}:${anchor.directKey ?? ''}`;
    case CONVERSATION_KIND.SCOPE_DIRECT:
      return `SCOPE_DIRECT:${anchor.directKey ?? ''}`;
    case CONVERSATION_KIND.GROUP:
      // A group is not idempotent by anything: two groups of the same people with the same name
      // are two groups. The random discriminator keeps the column non-null and the unique index
      // meaningful rather than making it a constraint groups have to dodge.
      return `GROUP:${anchor.directKey ?? randomUUID()}`;
    default:
      // One channel per project.
      return `PROJECT:${anchor.projectId ?? ''}`;
  }
}

export function toConversationSummary(
  row: ConversationRow,
  viewerId: string,
  extras: { unreadCount: number; preview: MessageRow | undefined },
): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    title: titleOf(row),
    project: row.project,
    task: row.task
      ? { id: row.task.id, key: `TK-${row.task.number}`, title: row.task.title }
      : null,
    ticket: row.ticket
      ? { id: row.ticket.id, key: `T-${row.ticket.number}`, title: row.ticket.title }
      : null,
    counterpart: counterpartOf(row, viewerId),
    imageFileId: row.imageFileId,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    // The preview is the message body, which the caller is already authorized to read — the list
    // is filtered through the policy before it is mapped.
    lastMessagePreview: extras.preview ? previewOf(extras.preview) : null,
    unreadCount: extras.unreadCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toConversationDetail(
  row: ConversationRow,
  viewerId: string,
  extras: {
    unreadCount: number;
    preview: MessageRow | undefined;
    abilities: ConversationAbilities;
    roles: Map<string, ProjectMemberRole>;
  },
): ConversationDetail {
  return {
    ...toConversationSummary(row, viewerId, extras),
    participants: row.members.map((member) => ({
      ...member.user,
      // Their role *now*, not when they joined. Somebody who has left the project shows as null
      // here, which is the honest answer and the same one the policy gives.
      projectRole: extras.roles.get(member.userId) ?? null,
      memberRole: member.role as ConversationMemberRole,
      lastReadAt: member.lastReadAt?.toISOString() ?? null,
      joinedAt: member.joinedAt.toISOString(),
      leftAt: member.leftAt?.toISOString() ?? null,
    })),
    abilities: extras.abilities,
  };
}

/**
 * What one caller may do to one message.
 *
 * Defaults to nothing, and that is the honest default for the two places that have no caller to
 * decide for: a system message the server wrote, and a realtime payload fanned out to an audience
 * whose members would each get a different answer. Both are followed by a refetch that asks
 * properly, so a `false` here costs a control for a moment and never grants one wrongly.
 */
export interface MessageAbilities {
  canEdit: boolean;
  canDelete: boolean;
}

export const NO_MESSAGE_ABILITIES: MessageAbilities = { canEdit: false, canDelete: false };

export function toMessageSummary(
  row: MessageRow,
  abilities: MessageAbilities = NO_MESSAGE_ABILITIES,
): MessageSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: row.sender,
    // A deleted message keeps its place in the thread so the conversation still reads correctly,
    // but its body does not survive into the response.
    body: row.deletedAt ? '' : row.body,
    systemKind: (row.systemKind as MessageSystemKind | null) ?? null,
    attachments: row.deletedAt ? [] : row.attachments.map(toMessageFileSummary),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    ...abilities,
  };
}

export function toMessageRevisionSummary(row: MessageRevisionRow): MessageRevisionSummary {
  return {
    id: row.id,
    messageId: row.messageId,
    body: row.body,
    editedBy: row.editedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** What a conversation is called, when nobody named it. */
function titleOf(row: ConversationRow): string {
  if (row.title) {
    return row.title;
  }
  switch (row.kind) {
    case CONVERSATION_KIND.PROJECT:
      return row.project
        ? `${row.project.code} · ${CONVERSATION_KIND_LABELS.PROJECT}`
        : CONVERSATION_KIND_LABELS.PROJECT;
    case CONVERSATION_KIND.TASK:
      return row.task ? `TK-${row.task.number} · ${row.task.title}` : CONVERSATION_KIND_LABELS.TASK;
    case CONVERSATION_KIND.TICKET:
      return row.ticket
        ? `T-${row.ticket.number} · ${row.ticket.title}`
        : CONVERSATION_KIND_LABELS.TICKET;
    case CONVERSATION_KIND.GROUP:
      // A group with no title is a bug rather than a state — the create endpoint requires one —
      // so this is a fallback, not a naming scheme.
      return CONVERSATION_KIND_LABELS.GROUP;
    default:
      return CONVERSATION_KIND_LABELS[row.kind as ConversationKind];
  }
}

function counterpartOf(row: ConversationRow, viewerId: string) {
  if (!PAIR_MEMBERSHIP_KINDS.includes(row.kind as ConversationKind)) {
    return null;
  }
  return row.members.find((member) => member.userId !== viewerId)?.user ?? null;
}

function previewOf(message: MessageRow): string {
  if (message.deletedAt) {
    // A guard rather than a path anything takes: `ConversationsRepository.previews` selects
    // `deletedAt: null`, so the list falls back to the last surviving message instead of reaching
    // here. It matters more than it did — a preview can now be a file name, and naming the file of
    // a withdrawn message would put back exactly what the tombstone took away.
    return 'Message deleted';
  }
  // Shared with the notification line, so a message says the same thing wherever it is quoted
  // without its thread. See `message-preview.ts`.
  return messagePreview(message.body, message.attachments);
}

/** The two people of a direct conversation, as one stable key. */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}
