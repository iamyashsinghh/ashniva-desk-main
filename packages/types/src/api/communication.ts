import type {
  ConversationKind,
  ConversationMemberRole,
  InternalCallFallback,
  MessageSystemKind,
} from '../domain/conversation';
import type { RecordingPlaybackScope, RecordingPolicy } from '../domain/ivr-policy';
import type { ProjectMemberRole } from '../domain/project-member-role';
import type { CommunicationRefusal } from '../workflow/communication-policy';
import type { FileSummary } from './work';
import type { UserRef } from './identity';

/**
 * Internal conversations over the wire.
 *
 * There is no portal shape in this file, and that is not an omission. An internal conversation
 * has no client-visible form: the module's controllers refuse a client outright, the websocket
 * refuses their subscription, and there is no mapper that could produce a client payload because
 * none is defined. Making one would be a new, explicitly named piece of work rather than a flag.
 */

/** Somebody in a conversation, with the project role that admits them. */
export interface ConversationParticipant extends UserRef {
  /**
   * Their role on the conversation's project, resolved now rather than when they joined. Null for
   * a scope conversation, which has no project to hold a role on.
   */
  projectRole: ProjectMemberRole | null;
  /** Their standing on the member list. Only meaningful for a group. */
  memberRole: ConversationMemberRole;
  lastReadAt: string | null;
  joinedAt: string;
  /** When they left, for a group somebody has left. A former member reads nothing. */
  leftAt: string | null;
}

/** A conversation in a list. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  /**
   * The project the conversation hangs off, or null for the two scope kinds.
   *
   * Null is not "unknown": it is the whole difference between a thread whose permission is
   * derived from a project and one whose permission is derived from management scope.
   */
  project: { id: string; code: string; name: string } | null;
  /** The task or ticket this conversation is attached to, when it is attached to one. */
  task: { id: string; key: string; title: string } | null;
  ticket: { id: string; key: string; title: string } | null;
  /** For either direct kind, the other person. Null for a group and for the derived kinds. */
  counterpart: UserRef | null;
  /** A group's picture: an ordinary `files` row, fetched through the files module. */
  imageFileId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  participants: ConversationParticipant[];
  /** What this caller may do here, decided server-side. The UI renders it; it never computes it. */
  abilities: ConversationAbilities;
}

/**
 * The server's answer to "what may I do here", so a hidden control and a refused request are the
 * same decision made once.
 */
export interface ConversationAbilities {
  canPost: boolean;
  /**
   * Whether `POST /conversations/:id/calls` would accept this, which includes the fact that
   * telephony is project-anchored: false for a conversation with no project, whatever else is
   * true. A client should never have to ask about the project itself to know whether to offer the
   * control — an ability that disagrees with its endpoint is worse than no ability at all.
   */
  canCall: boolean;
  canPlayRecording: boolean;
  /**
   * Whether the caller administers this conversation: rename it, set its image, add and remove
   * members. Only ever true for a group's owner or an administrator — the derived and pair kinds
   * have nothing to administer.
   */
  canManage: boolean;
  /** Whether the caller may take themselves out of it. A group they are on, and nothing else. */
  canLeave: boolean;
  /** True when the caller is here on oversight rather than membership. Always audited. */
  viaOversight: boolean;
  /** Why not, when something is refused. Null when everything above is true. */
  reason: CommunicationRefusal | null;
}

export interface MessageSummary {
  id: string;
  conversationId: string;
  sender: UserRef | null;
  body: string;
  /** Set when the system wrote this rather than a person — a call starting or ending. */
  systemKind: MessageSystemKind | null;
  attachments: FileSummary[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /**
   * What this caller may do to *this message*, decided server-side.
   *
   * On the message rather than on `ConversationAbilities` because the answer differs between two
   * lines of the same thread: the edit window closes on one while the next is still fresh, and
   * being able to post here says nothing about whose message that is.
   */
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Who may read this conversation, and therefore who may be mentioned in it.
 *
 * Recomputed from live project membership like everything else here, and the same list the send
 * path intersects a mention against — so the composer cannot offer somebody the notification
 * would then refuse to reach.
 */
export interface ConversationAudienceMember extends UserRef {
  projectRole: ProjectMemberRole | null;
}

/** Longest search term the mention picker may send. Anything longer is a paste, not a name. */
export const MAX_MENTIONABLE_QUERY_LENGTH = 80;

/**
 * How few characters a mention search has to carry before the whole audience is scanned.
 *
 * One character is a keystroke, not a search: it matches most of a team and tells the person who
 * typed it nothing. Below this the endpoint answers with the head of the audience in name order —
 * the same first page the picker shows before anybody types — instead of a filtered scan.
 */
export const MIN_MENTIONABLE_QUERY_LENGTH = 2;

/** How many names one page of the mention picker carries, and the most it will ever carry. */
export const DEFAULT_MENTIONABLE_LIMIT = 10;
export const MAX_MENTIONABLE_LIMIT = 25;

/**
 * Somebody the caller may name in a mention, in this conversation.
 *
 * `roleName` is their role in the organization — "Developer", "Team lead" — and `contextLabel` is
 * the short reason they are reachable here, such as the project or the team they are connected
 * through. Both are for telling two people of the same name apart in a picker; neither is
 * authorization, and neither is consulted anywhere a decision is made.
 */
export interface MentionableUser {
  userId: string;
  name: string;
  email: string;
  roleName: string | null;
  /** "On ACME", "Testing this task", … Null when there is nothing short and true to say. */
  contextLabel: string | null;
}

/**
 * A page of the mention audience.
 *
 * Paged because the audience of a project channel is the project's staff, and a picker that
 * loaded all of them would be the "load every employee" query this endpoint exists to avoid.
 */
export interface MentionablePage {
  items: MentionableUser[];
  /** Id of the last person on this page, for the next one. Absent when the audience is exhausted. */
  nextCursor?: string;
}

/** One superseded version of a message body, kept so an edit cannot quietly rewrite the record. */
export interface MessageRevisionSummary {
  id: string;
  messageId: string;
  /** The body as it stood *before* the edit this revision records. */
  body: string;
  editedBy: UserRef | null;
  createdAt: string;
}

export interface MessagePage {
  items: MessageSummary[];
  /** Cursor for the next older page. Null when the beginning of the thread has been reached. */
  nextCursor: string | null;
}

/** Starting a conversation. Exactly one of the four shapes is meaningful per kind. */
export interface CreateConversationInput {
  kind: ConversationKind;
  projectId?: string;
  taskId?: string;
  ticketId?: string;
  /** For a direct conversation: the one other person. */
  withUserId?: string;
  title?: string;
}

export interface SendMessageInput {
  body: string;
  /** Ids of files already uploaded through the files module. Never a second upload path. */
  attachmentIds?: string[];
  /**
   * The caller's own id for this send.
   *
   * A retried send with the same key returns the message the first attempt created rather than
   * posting it twice, which is what makes a flaky connection safe to retry.
   */
  clientMessageId?: string;
}

/** Rewriting one of your own messages, inside the edit window. */
export interface EditMessageInput {
  body: string;
}

/** A call placed from a conversation, as the thread shows it. */
export interface ConversationCallSummary {
  id: string;
  conversationId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  initiatedBy: UserRef | null;
  participants: UserRef[];
  hasRecording: boolean;
  /** Whether *this* caller may play it. Computed server-side by the shared decision function. */
  canPlayRecording: boolean;
}

/** One organization's communication switches. */
export interface CommunicationSettingsSummary {
  organizationId: string;
  chatEnabled: boolean;
  callingEnabled: boolean;
  recordingPolicy: RecordingPolicy;
  recordingPlaybackScope: RecordingPlaybackScope;
  internalCallFallback: InternalCallFallback;
  updatedAt: string | null;
}

export interface CommunicationSettingsInput {
  chatEnabled?: boolean;
  callingEnabled?: boolean;
  recordingPolicy?: RecordingPolicy;
  recordingPlaybackScope?: RecordingPlaybackScope;
  internalCallFallback?: InternalCallFallback;
}

/** Who the caller may start a direct conversation with, and on which project. */
export interface CommunicationContact extends UserRef {
  projectId: string;
  projectCode: string;
  projectRole: ProjectMemberRole;
  /** An existing direct conversation with this person on this project, when there is one. */
  conversationId: string | null;
}

/**
 * Somebody the caller may reach outside a project, and why.
 *
 * The `reason` is not decoration: a directory that says "you may message this person" without
 * saying what makes that true invites the question every time somebody appears or disappears
 * from it. It is the same resolution the create and add-member endpoints run, so a name here is a
 * name those endpoints will accept.
 */
export interface MessagingScopeContact extends UserRef {
  /** What puts them inside the caller's reach, as a sentence the screen can show. */
  reason: string;
  /** An existing scope direct message with this person, when there is one. */
  conversationId: string | null;
}

/** Starting a direct message with somebody inside the caller's management scope. */
export interface CreateScopeDirectInput {
  userId: string;
}

/** Starting a group. Everybody named has to be inside the caller's scope, checked server-side. */
export interface CreateGroupInput {
  title: string;
  memberIds: string[];
  /** A `files` row to use as the group picture. */
  imageFileId?: string;
}

/**
 * Renaming a group, or changing its picture.
 *
 * `imageFileId: null` removes the picture, which is why the field is nullable rather than merely
 * optional: absent means "leave it alone" and null means "take it off".
 */
export interface UpdateConversationInput {
  title?: string;
  imageFileId?: string | null;
}

/** Adding somebody to a group. Their standing defaults to `MEMBER`. */
export interface AddConversationMemberInput {
  userId: string;
  role?: ConversationMemberRole;
}

/** The names of the websocket events this module adds. Shared so both ends spell them the same. */
export const CONVERSATION_EVENTS = {
  SUBSCRIBE: 'conversation.subscribe',
  UNSUBSCRIBE: 'conversation.unsubscribe',
  MESSAGE_NEW: 'conversation.message',
  /** A message was rewritten by its sender. Carries the message so a thread can be re-read. */
  MESSAGE_EDITED: 'conversation.message.edited',
  /** A message was withdrawn. The payload is the tombstone, with no body and no attachments. */
  MESSAGE_DELETED: 'conversation.message.deleted',
  /**
   * Somebody moved their own read cursor.
   *
   * Sent to that person's other devices and to nobody else: an unread badge that clears on the
   * phone and stays lit on the laptop is the bug this exists to prevent, and who has read what is
   * not the rest of the team's business.
   */
  READ_UPDATED: 'conversation.read',
  CALL_UPDATED: 'conversation.call',
} as const;

export type ConversationEvent = (typeof CONVERSATION_EVENTS)[keyof typeof CONVERSATION_EVENTS];

/** The payload of `conversation.message` and its edited/deleted siblings. Thin: the client
 *  refetches what it needs. */
export interface ConversationMessageEvent {
  conversationId: string;
  message: MessageSummary;
}

/** The payload of `conversation.read`. */
export interface ConversationReadEvent {
  conversationId: string;
  readAt: string;
}

/** The acknowledgement a subscribe attempt gets back. A refusal says why. */
export interface ConversationSubscribeAck {
  ok: boolean;
  conversationId: string;
  reason: CommunicationRefusal | null;
}
