/**
 * Internal conversations, and what they are attached to.
 *
 * This is not a company messenger. Ashniva Desk already has a messaging module and it sends mail
 * and WhatsApp *outward*; this is a different thing, and the difference that governs every
 * decision in this file and the next is that **the right to talk to somebody is derived from a
 * shared project, not from being an employee**. A developer on project A has no channel to a
 * developer on project B, and no deep link or crafted request produces one.
 *
 * The four project-anchored kinds below therefore each name a project, and nothing about them
 * changes. What was added alongside them is a second family — `SCOPE_DIRECT` and `GROUP` — whose
 * authority is *management scope* rather than a shared project: a manager may reach the people on
 * the projects and teams they run, a team lead the people they lead and the managers above them,
 * a super admin the whole tenant, and a developer or a tester **nobody they could not already
 * reach**. Those two kinds have no project, which is why `projectId` became nullable; they are
 * the only kinds that may leave it null, and the policy branches on that fact rather than
 * inferring it.
 */

/**
 * What a conversation is attached to.
 *
 * The first four name a project. The last two name a management relationship instead, and are the
 * only kinds with no project at all.
 */
export const CONVERSATION_KIND = {
  /** The project team's own channel. Open to whoever the policy admits, membership not listed. */
  PROJECT: 'PROJECT',
  /** Attached to one task. Its authority is the task's project, resolved live. */
  TASK: 'TASK',
  /** Internal discussion attached to a ticket. Never reaches the requester or the portal. */
  TICKET: 'TICKET',
  /** Two named people who share a project and whose roles the policy pairs. */
  DIRECT: 'DIRECT',
  /**
   * Two named people with no project between them, admitted by management scope.
   *
   * One row per pair for the whole organization — the pair is the whole anchor — where a
   * project-anchored `DIRECT` is one row per pair *per shared project*.
   */
  SCOPE_DIRECT: 'SCOPE_DIRECT',
  /** A named group of people, whose membership is listed rather than derived. */
  GROUP: 'GROUP',
} as const;

export type ConversationKind = (typeof CONVERSATION_KIND)[keyof typeof CONVERSATION_KIND];

export const CONVERSATION_KIND_LABELS: Record<ConversationKind, string> = {
  PROJECT: 'Project channel',
  TASK: 'Task discussion',
  TICKET: 'Internal ticket discussion',
  DIRECT: 'Direct',
  SCOPE_DIRECT: 'Direct message',
  GROUP: 'Group',
};

/**
 * How a conversation decides who is in it. Three answers, not two.
 *
 * The original split was binary — derived from the project, or the two people a `DIRECT` names —
 * and a group chat does not fit either half. So the question "how is membership decided here" now
 * has three answers, and every place that used to test for "open" tests for one of these:
 *
 *  * **`DERIVED`** — being on the project and passing the policy is what admits somebody. There is
 *    no participant row to add or to forget, and none to go stale.
 *  * **`PAIR`** — the conversation is between two named people. The pair is the identity of the
 *    thread, and the relationship that justified it is still recomputed on every request.
 *  * **`LISTED`** — the member rows *are* the membership. This is the new thing, and it is the one
 *    that needs care: a list can outlive the relationship that justified it, so every change to
 *    one is re-checked against the actor's scope at the moment of the change, and leaving is
 *    expressible (`leftAt`) rather than only ever being upserted in.
 */
export const CONVERSATION_MEMBERSHIP = {
  DERIVED: 'DERIVED',
  PAIR: 'PAIR',
  LISTED: 'LISTED',
} as const;

export type ConversationMembership =
  (typeof CONVERSATION_MEMBERSHIP)[keyof typeof CONVERSATION_MEMBERSHIP];

/**
 * Kinds whose membership is derived from the project rather than listed.
 *
 * Formerly `OPEN_CONVERSATION_KINDS`, renamed when the split stopped being binary: "open" said
 * what these were not, and there are now two different ways of not being one.
 */
export const DERIVED_MEMBERSHIP_KINDS: readonly ConversationKind[] = [
  CONVERSATION_KIND.PROJECT,
  CONVERSATION_KIND.TASK,
  CONVERSATION_KIND.TICKET,
];

/** Kinds that are between exactly two named people. */
export const PAIR_MEMBERSHIP_KINDS: readonly ConversationKind[] = [
  CONVERSATION_KIND.DIRECT,
  CONVERSATION_KIND.SCOPE_DIRECT,
];

/** Kinds whose member rows are the membership. */
export const LISTED_MEMBERSHIP_KINDS: readonly ConversationKind[] = [CONVERSATION_KIND.GROUP];

/** Kinds with no project: the two the scope rules admit, and only those two. */
export const SCOPE_CONVERSATION_KINDS: readonly ConversationKind[] = [
  CONVERSATION_KIND.SCOPE_DIRECT,
  CONVERSATION_KIND.GROUP,
];

export function membershipOf(kind: ConversationKind): ConversationMembership {
  if (LISTED_MEMBERSHIP_KINDS.includes(kind)) {
    return CONVERSATION_MEMBERSHIP.LISTED;
  }
  return PAIR_MEMBERSHIP_KINDS.includes(kind)
    ? CONVERSATION_MEMBERSHIP.PAIR
    : CONVERSATION_MEMBERSHIP.DERIVED;
}

/** Whether this kind takes its authority from management scope rather than from a project. */
export function isScopeKind(kind: ConversationKind): boolean {
  return SCOPE_CONVERSATION_KINDS.includes(kind);
}

/**
 * Somebody's standing in a conversation whose membership is listed.
 *
 * Only meaningful for a `GROUP`: the derived kinds have no list, and a pair has no hierarchy —
 * both people hold `MEMBER` there and neither may add a third.
 */
export const CONVERSATION_MEMBER_ROLE = {
  /** Made the group. May do everything an admin may, and cannot be removed by an admin. */
  OWNER: 'OWNER',
  /** May rename, set the image, and add or remove ordinary members. */
  ADMIN: 'ADMIN',
  /** May read and post. May leave. */
  MEMBER: 'MEMBER',
} as const;

export type ConversationMemberRole =
  (typeof CONVERSATION_MEMBER_ROLE)[keyof typeof CONVERSATION_MEMBER_ROLE];

export const CONVERSATION_MEMBER_ROLE_LABELS: Record<ConversationMemberRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Administrator',
  MEMBER: 'Member',
};

/** Whether this standing administers the group. */
export function administersGroup(role: ConversationMemberRole | null): boolean {
  return role === CONVERSATION_MEMBER_ROLE.OWNER || role === CONVERSATION_MEMBER_ROLE.ADMIN;
}

/**
 * The most people one group may hold.
 *
 * A bound rather than a product opinion: every member of a group is a row the send path fans out
 * to and a name the scope check re-verifies, so an unbounded list is an unbounded request.
 */
export const MAX_GROUP_MEMBERS = 100;

/** The longest a conversation title may be. Matches the column the DTO validates against. */
export const MAX_CONVERSATION_TITLE_LENGTH = 120;

/**
 * A message the system wrote rather than a person.
 *
 * Kept in the same table as ordinary messages so a call appears in the thread where it happened
 * rather than in a separate history nobody opens.
 */
export const MESSAGE_SYSTEM_KIND = {
  CALL_STARTED: 'CALL_STARTED',
  CALL_ENDED: 'CALL_ENDED',
  CONVERSATION_CREATED: 'CONVERSATION_CREATED',
} as const;

export type MessageSystemKind = (typeof MESSAGE_SYSTEM_KIND)[keyof typeof MESSAGE_SYSTEM_KIND];

/** The longest a single message may be. Long enough for a paragraph, short enough to store. */
export const MAX_MESSAGE_LENGTH = 4000;
/** The most attachments one message may carry. */
export const MAX_MESSAGE_ATTACHMENTS = 5;
/** The most messages one read returns. */
export const MAX_MESSAGE_PAGE = 100;

/**
 * How long the sender may still rewrite what they wrote.
 *
 * Fifteen minutes is a typo window, not a memory hole. The number is a compromise between two
 * failures: no window at all makes people delete and repost, which is worse for the thread than
 * an edit; an open-ended one lets somebody rewrite a decision after their colleague acted on it,
 * and a conversation whose history can be changed at leisure is not a record of anything.
 *
 * Fifteen minutes is short enough that the odds of somebody having relied on the message are low,
 * and where they are not, the previous body is kept as a revision (`message_revisions`) rather
 * than overwritten — the window bounds the *surprise*, the revision removes the *loss*.
 */
export const MESSAGE_EDIT_WINDOW_MINUTES = 15;

/**
 * How a mention is written inside a message body.
 *
 * The composer stores the user's id rather than their name, which is what makes a mention survive
 * somebody being renamed and what stops one being forged by typing a colleague's name. It is not
 * an authorization: the send path intersects whatever this finds with the audience it already
 * computed, so naming an id cannot deliver a notification to somebody who could not read the
 * message anyway.
 */
const MENTION_PATTERN = /@\[([0-9a-fA-F-]{36})\]/g;

/** The user ids named in a message body, in no particular order and without repeats. */
export function mentionsIn(body: string): string[] {
  const matches = body.matchAll(MENTION_PATTERN);
  return [...new Set([...matches].map((match) => match[1] as string))];
}

/**
 * A body with every mention replaced by `label`.
 *
 * Used wherever a message is shown without the names to resolve it against — a notification line,
 * a conversation-list preview — because a raw uuid in a sentence is noise at best and looks like
 * a leaked identifier at worst.
 */
export function maskMentions(body: string, label = '@someone'): string {
  return body.replace(MENTION_PATTERN, label);
}

/**
 * A body split into text and mentions, for a renderer that has names to substitute.
 *
 * Returned as parts rather than as HTML so the caller decides the markup; nothing in this package
 * builds a string a browser will interpret.
 */
export type MessageBodyPart = { kind: 'text'; text: string } | { kind: 'mention'; userId: string };

export function splitMentions(body: string): MessageBodyPart[] {
  const parts: MessageBodyPart[] = [];
  let index = 0;
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const start = match.index;
    if (start > index) {
      parts.push({ kind: 'text', text: body.slice(index, start) });
    }
    parts.push({ kind: 'mention', userId: match[1] as string });
    index = start + match[0].length;
  }
  if (index < body.length) {
    parts.push({ kind: 'text', text: body.slice(index) });
  }
  return parts;
}

/**
 * What happens to an internal call whose intended participant cannot be reached.
 *
 * Support calls walk package 8b's chain — module owner, primary, on-call, backup, escalation —
 * because a client's problem belongs to whoever can take it. An internal call is the opposite
 * kind of thing: a developer ringing a tester about their own work is a private conversation, and
 * quietly connecting it to an unrelated support agent would be a disclosure, not a fallback. So
 * the default is that there is no substitute at all, and the only widening available is the
 * project's own lead — somebody the pairing already admits.
 */
export const INTERNAL_CALL_FALLBACK = {
  /** The intended participant, or nobody. The default, and the safe one. */
  NONE: 'NONE',
  /** The intended participant, then the project's team lead or manager. Never anybody else. */
  PROJECT_LEAD: 'PROJECT_LEAD',
} as const;

export type InternalCallFallback =
  (typeof INTERNAL_CALL_FALLBACK)[keyof typeof INTERNAL_CALL_FALLBACK];

export const INTERNAL_CALL_FALLBACK_LABELS: Record<InternalCallFallback, string> = {
  NONE: 'Ring only the intended person',
  PROJECT_LEAD: 'Ring the intended person, then the project lead',
};
