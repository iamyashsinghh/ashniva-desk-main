import { CONVERSATION_KIND, type CreateConversationInput } from '@ashniva/types';

/**
 * The four ways a conversation is addressed.
 *
 * Kept beside the API client rather than in the panel: a screen that wants a task's thread should
 * not have to import a component to say so, and the literals belong in one place so a typo cannot
 * quietly open a second thread on the same task.
 */

/** The anchor for a project channel, so callers do not build the literal themselves. */
export const projectAnchor = (projectId: string): CreateConversationInput => ({
  kind: CONVERSATION_KIND.PROJECT,
  projectId,
});

export const taskAnchor = (taskId: string): CreateConversationInput => ({
  kind: CONVERSATION_KIND.TASK,
  taskId,
});

export const ticketAnchor = (ticketId: string): CreateConversationInput => ({
  kind: CONVERSATION_KIND.TICKET,
  ticketId,
});
