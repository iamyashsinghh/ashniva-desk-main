import {
  CONVERSATION_KIND,
  CONVERSATION_KIND_LABELS,
  PROJECT_MEMBER_ROLE_LABELS,
  type ConversationDetail,
} from '@ashniva/types';

/** Past this many people a list of names is longer than the bar, and a count says more. */
const MAX_NAMED_MEMBERS = 10;

/** The generic word the API may title a thread with, and never worth a header on its own. */
const GENERIC_TITLE = 'conversation';

function isPair(conversation: ConversationDetail): boolean {
  return (
    conversation.kind === CONVERSATION_KIND.DIRECT ||
    conversation.kind === CONVERSATION_KIND.SCOPE_DIRECT
  );
}

/** The other person in a pair, from the counterpart or, failing that, the participant rows. */
export function otherPerson(conversation: ConversationDetail, viewerId: string | null) {
  return (
    conversation.counterpart ??
    conversation.participants.find((person) => person.id !== viewerId) ??
    null
  );
}

/**
 * What the top bar calls a conversation: who or what it is about, never "Conversation".
 *
 * A pair is the other person; a group is its own name; a task or ticket thread is the item's key
 * and title, which is how people refer to them; a project channel is the project.
 */
export function conversationTitle(
  conversation: ConversationDetail,
  viewerId: string | null,
): string {
  let title = conversation.title;
  if (isPair(conversation)) {
    title = otherPerson(conversation, viewerId)?.name ?? title;
  } else if (conversation.kind === CONVERSATION_KIND.TASK && conversation.task) {
    title = `${conversation.task.key} ${conversation.task.title}`;
  } else if (conversation.kind === CONVERSATION_KIND.TICKET && conversation.ticket) {
    title = `${conversation.ticket.key} ${conversation.ticket.title}`;
  } else if (conversation.kind === CONVERSATION_KIND.PROJECT && conversation.project) {
    title = conversation.project.name;
  }
  const trimmed = title.trim();
  return trimmed && trimmed.toLowerCase() !== GENERIC_TITLE
    ? trimmed
    : CONVERSATION_KIND_LABELS[conversation.kind];
}

/**
 * The small line under the title.
 *
 * A group names who is in it now — first names, the reader as "You" at the end — the way phone
 * chats do, and falls back to a count once that would not fit. A pair says what the other person
 * does on the project when that is known, and otherwise invites a tap for the details.
 */
export function conversationSubtitle(
  conversation: ConversationDetail,
  viewerId: string | null,
): string {
  const present = conversation.participants.filter((person) => person.leftAt === null);
  switch (conversation.kind) {
    case CONVERSATION_KIND.GROUP: {
      if (present.length === 0 || present.length > MAX_NAMED_MEMBERS) {
        return `${present.length} ${present.length === 1 ? 'member' : 'members'}`;
      }
      const others = present
        .filter((person) => person.id !== viewerId)
        .map((person) => person.name.trim().split(/\s+/)[0] ?? person.name);
      const includesViewer = present.some((person) => person.id === viewerId);
      return [...others, ...(includesViewer ? ['You'] : [])].join(', ');
    }
    case CONVERSATION_KIND.TASK:
      return withProject('Task', conversation);
    case CONVERSATION_KIND.TICKET:
      return withProject('Ticket', conversation);
    case CONVERSATION_KIND.PROJECT:
      return `${CONVERSATION_KIND_LABELS.PROJECT} · ${present.length} ${present.length === 1 ? 'member' : 'members'}`;
    default: {
      const other = otherPerson(conversation, viewerId);
      const row = other
        ? conversation.participants.find((person) => person.id === other.id)
        : undefined;
      return row?.projectRole ? PROJECT_MEMBER_ROLE_LABELS[row.projectRole] : 'tap here for info';
    }
  }
}

function withProject(label: string, conversation: ConversationDetail): string {
  return conversation.project ? `${label} · ${conversation.project.code}` : label;
}
