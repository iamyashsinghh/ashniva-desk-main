import { CONVERSATION_KIND } from '@ashniva/types';

import type { ConversationRow } from './conversations.repository';

/**
 * Where a conversation lives in the web app, and what to call it.
 *
 * Shared by the notification and the audit paths so a link in an email and a link in the bell
 * menu take somebody to the same place. A task or ticket conversation deep-links to the work it
 * is about rather than to a chat screen, because that is where the person will want to be.
 */
export function conversationLink(row: ConversationRow): string {
  switch (row.kind) {
    case CONVERSATION_KIND.TASK:
      return row.taskId ? `/tasks/${row.taskId}` : `/messages/${row.id}`;
    case CONVERSATION_KIND.TICKET:
      return row.ticketId ? `/tickets/${row.ticketId}` : `/messages/${row.id}`;
    case CONVERSATION_KIND.PROJECT:
      return row.projectId ? `/projects/${row.projectId}` : `/messages/${row.id}`;
    default:
      return `/messages/${row.id}`;
  }
}

export function conversationName(row: ConversationRow): string {
  if (row.title) {
    return row.title;
  }
  switch (row.kind) {
    case CONVERSATION_KIND.TASK:
      return row.task ? `TK-${row.task.number}` : 'a task discussion';
    case CONVERSATION_KIND.TICKET:
      return row.ticket ? `T-${row.ticket.number}` : 'a ticket discussion';
    case CONVERSATION_KIND.PROJECT:
      return row.project ? `${row.project.code} project chat` : 'a project channel';
    case CONVERSATION_KIND.GROUP:
      return 'a group';
    default:
      return 'a direct conversation';
  }
}
