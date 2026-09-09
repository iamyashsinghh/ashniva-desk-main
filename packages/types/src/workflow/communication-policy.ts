/**
 * Who may talk to whom, and about what.
 *
 * This is the whole of package 9b's judgement, and it is pure so that it can be exhaustively
 * tested and so that the API and the web app cannot disagree about it. The API calls it as the
 * decision; the web app calls it to decide whether to draw a control. Hiding a control is
 * decoration — the endpoint runs this too, on every request, and refuses.
 *
 * ## Why the permission is computed and never listed
 *
 * The obvious model — a participants table, add whoever you like — fails the first time somebody
 * leaves a project, because the row outlives the relationship that justified it. So a participant
 * row is a read cursor and a hint, never an authorization record. **The relationship is
 * recomputed on every send, every read and every call** from the facts below, all of which the
 * caller resolves fresh. Losing your place on a project silently loses your access to its
 * conversations, which is exactly what a stored list cannot give.
 */

import {
  MESSAGE_EDIT_WINDOW_MINUTES,
  administersGroup,
  type ConversationMemberRole,
} from '../domain/conversation';
import { type ProjectMemberRole } from '../domain/project-member-role';
import { DIRECT_ROLE_PAIRINGS, needsSharedWork } from './direct-pairings';

// Re-exported so the table and the decision keep one import path between them: everything that
// asked `communication-policy` about the pairings still asks it.
export { DIRECT_ROLE_PAIRINGS, needsSharedWork, pairingIsSymmetric } from './direct-pairings';

/** What the caller is trying to do. Every one of these recomputes the relationship. */
export const COMMUNICATION_ACTION = {
  /** Start a conversation, or add somebody to one. */
  CREATE: 'CREATE',
  /** Read a conversation and its messages. */
  READ: 'READ',
  /** Post a message or an attachment. */
  POST: 'POST',
  /**
   * Rewrite one of your own messages, inside the edit window.
   *
   * Per message rather than per conversation, which is why it takes `message` below. Losing your
   * place on the project loses this with everything else: you may not rewrite the history of a
   * thread you can no longer post in.
   */
  EDIT: 'EDIT',
  /** Withdraw a message: your own, or anybody's with oversight. */
  DELETE: 'DELETE',
  ADD_PARTICIPANT: 'ADD_PARTICIPANT',
  /** Place a call from a conversation. */
  CALL: 'CALL',
  /** See that a call happened, who was on it and how long it lasted. */
  VIEW_CALL: 'VIEW_CALL',
  /** Listen to a recording. Passing this is necessary and not sufficient — see below. */
  PLAY_RECORDING: 'PLAY_RECORDING',
  /** Super-admin oversight: read across the organization's conversations. Always audited. */
  INSPECT: 'INSPECT',
} as const;

export type CommunicationAction = (typeof COMMUNICATION_ACTION)[keyof typeof COMMUNICATION_ACTION];

/**
 * Why a request was refused.
 *
 * Named for the same purpose the routing engine's skip reasons are: so a refusal can be explained
 * rather than merely returned. The API maps these to a sentence; the codes are what anything else
 * branches on.
 */
export const COMMUNICATION_REFUSAL = {
  /** A client user. Internal communication is internal, and no policy here can admit one. */
  NOT_INTERNAL: 'NOT_INTERNAL',
  NOT_SAME_TENANT: 'NOT_SAME_TENANT',
  /** Not a member of the conversation's project. */
  NOT_ON_PROJECT: 'NOT_ON_PROJECT',
  /**
   * On the project, but with no relationship to the *task* the conversation hangs off.
   *
   * Distinct from `NOT_ON_PROJECT` because it is a different fact and a different fix: the person
   * is on the project and can see the project's own channel, and what they lack is a place on this
   * piece of work. Being on a project is being able to talk about the project; it is not being in
   * every private discussion of every task on it, and the two used to be the same answer.
   */
  NOT_ON_TASK: 'NOT_ON_TASK',
  /** The other person is not on that project either, so there is no shared relationship. */
  COUNTERPART_NOT_ON_PROJECT: 'COUNTERPART_NOT_ON_PROJECT',
  /** Both on the project, but their roles are not a pairing the policy admits. */
  ROLE_PAIR_NOT_ALLOWED: 'ROLE_PAIR_NOT_ALLOWED',
  /**
   * A developer and a tester with no shared task or ticket between them.
   *
   * Distinct from `ROLE_PAIR_NOT_ALLOWED` because the pairing *is* admitted — it is the working
   * relationship that is missing, and that is something that can come to exist tomorrow.
   */
  NO_SHARED_WORK: 'NO_SHARED_WORK',
  CHAT_DISABLED: 'CHAT_DISABLED',
  CALLING_DISABLED: 'CALLING_DISABLED',
  NO_PERMISSION: 'NO_PERMISSION',
  /** An inspector may read what they oversee. They may not join in. */
  OVERSIGHT_IS_READ_ONLY: 'OVERSIGHT_IS_READ_ONLY',
  /** Somebody else's message. Nobody edits another person's words, whatever they may delete. */
  NOT_THE_AUTHOR: 'NOT_THE_AUTHOR',
  /** The message is old enough that somebody may have acted on it. */
  EDIT_WINDOW_CLOSED: 'EDIT_WINDOW_CLOSED',
  /** A system note, or a message already withdrawn. Neither has an author to speak for it. */
  MESSAGE_NOT_EDITABLE: 'MESSAGE_NOT_EDITABLE',
  /**
   * Withdrawing is administrative now, and is not something a sender does to their own words.
   *
   * The old rule let a sender delete anything of theirs at any age, which makes a conversation a
   * record of whatever its participants still want it to say. Taking a message down remains
   * possible — through `conversation:inspect`, audited as an inspection — and this is the refusal
   * everybody else gets, including the person who wrote it.
   */
  DELETE_IS_ADMINISTRATIVE: 'DELETE_IS_ADMINISTRATIVE',
  /** The other person is outside the actor's management scope, so there is no relationship. */
  NOT_IN_SCOPE: 'NOT_IN_SCOPE',
  /** A conversation whose membership is listed, and the actor is not on the list. */
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  /** Only the owner or an administrator of a group may change who is in it or what it is called. */
  NOT_GROUP_ADMIN: 'NOT_GROUP_ADMIN',
  /** A pair is two people by definition; there is no third place to add somebody to. */
  NOT_A_GROUP: 'NOT_A_GROUP',
  /**
   * Telephony is project-anchored, and a scope conversation has no project.
   *
   * Everything an internal call needs comes from one — the fallback destination, the recording
   * playback scope, and the roles that decide it — so `ConversationCallsService` refuses a
   * conversation with no project before it consults anything else. This is that same refusal said
   * here, so that `canCommunicate(CALL)` and the endpoint cannot disagree: an ability that says
   * yes where the endpoint says no is the one failure `ConversationAbilities` exists to prevent.
   */
  CALL_NEEDS_PROJECT: 'CALL_NEEDS_PROJECT',
} as const;

export type CommunicationRefusal =
  (typeof COMMUNICATION_REFUSAL)[keyof typeof COMMUNICATION_REFUSAL];

export const COMMUNICATION_REFUSAL_LABELS: Record<CommunicationRefusal, string> = {
  NOT_INTERNAL: 'Internal conversations are not part of the client portal',
  NOT_SAME_TENANT: 'This conversation belongs to another organization',
  NOT_ON_PROJECT: 'You are not on this project',
  NOT_ON_TASK: 'This discussion belongs to the people working on the task',
  COUNTERPART_NOT_ON_PROJECT: 'You have no project in common with that person',
  ROLE_PAIR_NOT_ALLOWED: 'Your roles on this project do not open a direct conversation',
  NO_SHARED_WORK: 'You have no task or ticket in common with that person',
  CHAT_DISABLED: 'Internal chat is switched off for this organization',
  CALLING_DISABLED: 'Internal calling is switched off for this organization',
  NO_PERMISSION: 'You do not have permission to do that',
  OVERSIGHT_IS_READ_ONLY: 'Oversight access is read-only',
  NOT_THE_AUTHOR: 'Only the person who wrote a message may change it',
  EDIT_WINDOW_CLOSED: `A message can only be edited for ${MESSAGE_EDIT_WINDOW_MINUTES} minutes after it is sent`,
  MESSAGE_NOT_EDITABLE: 'This message cannot be changed',
  DELETE_IS_ADMINISTRATIVE:
    'A message cannot be withdrawn once it is sent; ask somebody with oversight',
  NOT_IN_SCOPE: 'That person is not somebody you may start a conversation with',
  NOT_A_MEMBER: 'You are not in this conversation',
  NOT_GROUP_ADMIN: 'Only the group’s owner or an administrator may do that',
  NOT_A_GROUP: 'A direct conversation is between two people and takes no others',
  CALL_NEEDS_PROJECT: 'Calls are placed from a project conversation',
};

/**
 * The one message an `EDIT` or a `DELETE` names.
 *
 * Editing and deleting are the only actions in this file whose answer differs between two
 * messages in the same conversation, so they are the only ones that carry a message. The age is
 * passed in whole minutes rather than as a timestamp so the decision stays pure: a function that
 * reads the clock cannot be tested against a fixed answer.
 */
export interface MessageAuthorship {
  /** Whether the actor wrote it. A system note is nobody's, so this is false for one. */
  isOwnMessage: boolean;
  /** A call starting or ending. Written by the system, and not anybody's to rewrite. */
  isSystemMessage: boolean;
  /** Already withdrawn. There is nothing left to change. */
  isDeleted: boolean;
  /** Whole minutes since it was posted. */
  ageMinutes: number;
}

/**
 * The facts of a conversation that has no project, resolved by the caller from live rows.
 *
 * Its presence is what selects the scope branch of `canCommunicate`, and its absence is what
 * leaves the project-anchored decision exactly as it was. Nothing in here is consulted for a
 * conversation with a project, and nothing in the project-anchored inputs is consulted here.
 */
export interface CommunicationScopeContext {
  /** How membership is decided: a named pair, or a listed group. */
  membership: 'PAIR' | 'LISTED';
  /**
   * Whether the actor is *currently* on the list — a member of the pair, or a group member who
   * has not left. This is the one place in the package where a stored row is the authorization,
   * and it is only ever load-bearing because every change to the list is re-checked against scope
   * at the moment of the change and `leftAt` makes leaving expressible.
   */
  isListedMember: boolean;
  /** The actor's standing in the group. Null when they are not on the list, or for a pair. */
  memberRole: ConversationMemberRole | null;
  /**
   * Whether every person this action names is inside the actor's management reach, recomputed
   * now from projects and teams. Undefined when the action names nobody.
   *
   * A super admin's reach is the whole tenant, which is the *only* way oversight widens anything
   * here: it makes this true where it would otherwise be false, and it never touches any other
   * action or any project-anchored thread.
   */
  counterpartInScope?: boolean;
}

/** Everything the decision needs, all of it resolved by the caller from live rows. */
export interface CommunicationInput {
  action: CommunicationAction;
  /** False for every client user and every external person, whatever else is true. */
  isInternal: boolean;
  /** Whether the actor's tenant is the conversation's tenant. */
  sameTenant: boolean;
  /** The actor's role on the conversation's project *now*. Null when they are not a member. */
  actorProjectRole: ProjectMemberRole | null;
  /**
   * The other person's role on that same project, for a direct conversation or for starting one.
   * Undefined when the action does not involve a specific counterpart.
   */
  counterpartProjectRole?: ProjectMemberRole | null;
  /** Whether a task or ticket ties the two people together. Only consulted for the pairs above. */
  sharedWorkRelationship?: boolean;
  /**
   * Whether the actor has a relationship with the *task* a `TASK` conversation hangs off.
   *
   * Set only for a task-anchored conversation, and `undefined` everywhere else — a project channel,
   * a ticket thread, a direct message and a group are all decided by exactly the code that decided
   * them before this field existed.
   *
   * It is a narrowing and never a widening: a `true` here still has to get past project membership,
   * the participate permission and everything below. What it adds is the fact the project-anchored
   * decision could not see — that being on a project is *not* being on every task of it — and the
   * caller resolves it from the same task relations `TaskVisibilityService` reads (assignee,
   * creator, reviewer, tester, a live testing assignment, the projects one manages or leads and the
   * teams one leads), so task chat and the task list cannot come to disagree about who is on a task.
   */
  taskRelationship?: boolean;
  /**
   * Set only for a conversation with no project — a scope direct message or a group.
   *
   * Its presence switches the whole decision to `scopeDecision` below. A conversation that has a
   * project never carries one, and so is decided by exactly the code that decided it before the
   * scope kinds existed.
   */
  scope?: CommunicationScopeContext;
  /** The message an `EDIT` or `DELETE` is about. Undefined for every other action. */
  message?: MessageAuthorship;
  /** Organization switches. Chat and calling are separate: one may be wanted without the other. */
  chatEnabled: boolean;
  callingEnabled: boolean;
  /** `communication:participate` — read and post in conversations you belong to. */
  canParticipate: boolean;
  /** `communication:call` — place a call from a conversation. */
  canCall: boolean;
  /** `communication:inspect` — super-admin oversight. A read grant, never a write one. */
  canInspect: boolean;
  /** `communication:recording:play` — necessary for playback, and not sufficient. */
  canPlayRecording: boolean;
}

export interface CommunicationDecision {
  allowed: boolean;
  reason: CommunicationRefusal | null;
  /**
   * True when the only thing admitting this caller is oversight.
   *
   * The caller uses it to audit the access as an inspection rather than as ordinary reading, and
   * to refuse anything that would write.
   */
  viaOversight: boolean;
}

/**
 * Actions that put something into a conversation.
 *
 * `EDIT` is here because an edit is a post rewritten: the same relationship has to hold, so
 * switching chat off stops one and losing the project stops one. `DELETE` is deliberately *not*
 * here. Taking your own words back is not adding to the conversation, and an organization that
 * has just switched chat off is often doing it precisely because something needs removing —
 * a moderator locked out at that moment would be the wrong answer.
 */
const WRITING_ACTIONS: readonly CommunicationAction[] = [
  COMMUNICATION_ACTION.CREATE,
  COMMUNICATION_ACTION.POST,
  COMMUNICATION_ACTION.EDIT,
  COMMUNICATION_ACTION.ADD_PARTICIPANT,
  COMMUNICATION_ACTION.CALL,
];

/** The two actions that name one message rather than the whole conversation. */
const MESSAGE_ACTIONS: readonly CommunicationAction[] = [
  COMMUNICATION_ACTION.EDIT,
  COMMUNICATION_ACTION.DELETE,
];

const allow = (viaOversight = false): CommunicationDecision => ({
  allowed: true,
  reason: null,
  viaOversight,
});

const refuse = (reason: CommunicationRefusal): CommunicationDecision => ({
  allowed: false,
  reason,
  viaOversight: false,
});

/**
 * May this person do this, here, now?
 *
 * The order of the checks is the order of the answers somebody deserves. A client is told they
 * are a client, not that they lack a permission they could ask for and would never be given; a
 * developer with no project in common is told that, not that their roles do not pair.
 */
export function canCommunicate(input: CommunicationInput): CommunicationDecision {
  // 1. Internal only. Nothing later can rescue this, and there is no shape of this module a
  //    client reaches — not a controller, not a socket event, not an attachment.
  if (!input.isInternal) {
    return refuse(COMMUNICATION_REFUSAL.NOT_INTERNAL);
  }
  if (!input.sameTenant) {
    return refuse(COMMUNICATION_REFUSAL.NOT_SAME_TENANT);
  }

  // 1b. A conversation with no project is judged on management scope instead, by its own
  //     function. The branch is taken on a fact the caller cannot fake into existence — a scope
  //     context is only built for a row whose `project_id` is null — and everything below this
  //     line is therefore reached by exactly the conversations that reached it before.
  if (input.scope) {
    return scopeDecision(input, input.scope);
  }

  // 2. Oversight, which is a read grant across the organization and nothing more. Checked before
  //    membership because an inspector is deliberately not a member of what they inspect.
  //
  //    Belonging here is two facts for a task conversation and one for everything else. A
  //    `taskRelationship` of `false` makes somebody a non-member of *this thread* while leaving
  //    them a member of the project — which is why it is folded into `isMember` rather than tested
  //    later: it puts an unrelated project member on exactly the path an outsider already takes, so
  //    an inspector still reaches the thread through oversight (read-only, audited) and everybody
  //    else is refused before a single fact about the conversation is disclosed.
  const onProject = input.actorProjectRole !== null;
  const isMember = onProject && input.taskRelationship !== false;
  if (input.action === COMMUNICATION_ACTION.INSPECT) {
    return input.canInspect ? allow(true) : refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }
  if (!isMember && input.canInspect) {
    // Withdrawing a message is the single write oversight admits, and it is admitted because it
    // removes rather than adds: the person who can already read every thread is the one asked to
    // take something down from one. The caller audits it as an inspection — `viaOversight` says so.
    if (input.action === COMMUNICATION_ACTION.DELETE) {
      // Still subject to the shape rule: a system note has nobody to speak for it and a withdrawn
      // message has nothing left to withdraw, and oversight changes neither of those facts.
      return messageShapeRule(input) ?? allow(true);
    }
    if (WRITING_ACTIONS.includes(input.action)) {
      return refuse(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
    }
    if (input.action === COMMUNICATION_ACTION.PLAY_RECORDING && !input.canPlayRecording) {
      return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
    }
    return allow(true);
  }

  // 3. Membership of the conversation's project, and of its task where it has one. Both are facts
  //    a stored participant list would have let go stale, which is why there is no stored
  //    participant list. The two refusals are told apart because they are different situations:
  //    one is fixed by being put on the project, the other by being given a place on the work.
  if (!isMember) {
    return refuse(
      onProject ? COMMUNICATION_REFUSAL.NOT_ON_TASK : COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
    );
  }
  if (!input.canParticipate) {
    return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }

  // 4. What kind of message an edit or a delete names. *After* belonging here, not before: a
  //    caller who may not read this conversation must not learn from the refusal whether the id
  //    they named is a system note, a tombstone or somebody's live message. Only once they are
  //    admitted does the shape of the message become theirs to be told about — and then it comes
  //    first among the message rules, because a system note has nobody to speak for it and a
  //    withdrawn message has nothing left to change, whatever else the asker holds.
  const shape = messageShapeRule(input);
  if (shape) {
    return shape;
  }

  // 5. The switches. Reading a thread that already exists survives chat being turned off; writing
  //    into one does not, which is what "switched off" has to mean.
  if (!input.chatEnabled && WRITING_ACTIONS.includes(input.action)) {
    return refuse(COMMUNICATION_REFUSAL.CHAT_DISABLED);
  }

  // 6. The pairing, for anything that names a second person.
  const pairing = pairingFor(input);
  if (pairing) {
    return pairing;
  }

  // 7. Calling, on top of everything above.
  if (input.action === COMMUNICATION_ACTION.CALL) {
    if (!input.callingEnabled) {
      return refuse(COMMUNICATION_REFUSAL.CALLING_DISABLED);
    }
    if (!input.canCall) {
      return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
    }
  }

  // 8. Playback needs its own permission on top of belonging here. Whether the *recording* may be
  //    played is a second decision, made by `canPlayRecording` against the project role — this
  //    only says the caller belongs in the conversation the call happened in.
  if (input.action === COMMUNICATION_ACTION.PLAY_RECORDING && !input.canPlayRecording) {
    return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }

  // 9. Whose message it is, and how old. Last, because everything above is about belonging in the
  //    conversation and this is about one line inside it — a developer who has left the project
  //    should be told that, not that their own message is too old to edit.
  const authorship = messageAuthorshipRule(input);
  if (authorship) {
    return authorship;
  }

  return allow();
}

/**
 * The same questions, asked of a conversation that has no project.
 *
 * Deliberately a separate function rather than a set of conditions threaded through the one
 * above. The project-anchored decision is the security-critical thing this package already had
 * right, and the way to be sure it still behaves identically is for it to be unreachable from
 * here and this to be unreachable from there.
 *
 * The order of the answers is the same idea as the main function's: create is decided before
 * anybody is a member, oversight is a read grant, and membership is what admits everybody else.
 */
function scopeDecision(
  input: CommunicationInput,
  scope: CommunicationScopeContext,
): CommunicationDecision {
  // Creating happens before there is a member list to consult, so it turns on three things only:
  // the permission to take part at all, the switch, and whether every person named is inside the
  // actor's reach. That last one is where a super admin's tenant-wide scope enters — and the only
  // place it does, which is what keeps "an admin may start a group with anybody" from becoming
  // "an admin may write in a project thread they are not on".
  if (input.action === COMMUNICATION_ACTION.CREATE) {
    if (!input.canParticipate) {
      return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
    }
    if (!input.chatEnabled) {
      return refuse(COMMUNICATION_REFUSAL.CHAT_DISABLED);
    }
    return scope.counterpartInScope ? allow() : refuse(COMMUNICATION_REFUSAL.NOT_IN_SCOPE);
  }

  if (input.action === COMMUNICATION_ACTION.INSPECT) {
    return input.canInspect ? allow(true) : refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }

  // Oversight over a conversation the inspector is not in: read it, withdraw from it, nothing
  // else. Exactly what an inspector may do to a project thread they are not on.
  if (!scope.isListedMember && input.canInspect) {
    if (input.action === COMMUNICATION_ACTION.DELETE) {
      return messageShapeRule(input) ?? allow(true);
    }
    if (WRITING_ACTIONS.includes(input.action)) {
      return refuse(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
    }
    if (input.action === COMMUNICATION_ACTION.PLAY_RECORDING && !input.canPlayRecording) {
      return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
    }
    return allow(true);
  }

  // Membership is the authorization here, and that is the change of contract this kind carries.
  // It is bounded by the two things that keep a list from outliving its justification: every
  // addition is re-checked against the adder's scope when it is made, and somebody removed gets a
  // `leftAt` rather than staying listed for ever.
  if (!scope.isListedMember) {
    return refuse(COMMUNICATION_REFUSAL.NOT_A_MEMBER);
  }
  if (!input.canParticipate) {
    return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }

  // The relationship that opened a pair closes when the relationship does. The caller sets
  // `counterpartInScope` on a `SCOPE_DIRECT` for the person who *started* it — the one who had a
  // management reach to lose — so a manager who stops managing the project stops reaching the
  // colleague they reached through it. `undefined` means this action named nobody and there is
  // nothing to re-check; `false` is a live refusal and comes before anything about a message,
  // because somebody no longer admitted must not learn the shape of what is inside.
  if (scope.counterpartInScope === false && input.action !== COMMUNICATION_ACTION.ADD_PARTICIPANT) {
    return refuse(COMMUNICATION_REFUSAL.NOT_IN_SCOPE);
  }

  const shape = messageShapeRule(input);
  if (shape) {
    return shape;
  }

  if (!input.chatEnabled && WRITING_ACTIONS.includes(input.action)) {
    return refuse(COMMUNICATION_REFUSAL.CHAT_DISABLED);
  }

  if (input.action === COMMUNICATION_ACTION.ADD_PARTICIPANT) {
    if (scope.membership !== 'LISTED') {
      return refuse(COMMUNICATION_REFUSAL.NOT_A_GROUP);
    }
    if (!administersGroup(scope.memberRole)) {
      return refuse(COMMUNICATION_REFUSAL.NOT_GROUP_ADMIN);
    }
    // Being in the group is not a licence to bring in anybody at all: the person added has to be
    // inside the *adder's* reach, checked now rather than when the group was made. `undefined` is
    // refused here rather than waved through — an add that names nobody is a caller mistake, and
    // a permissive default in this position is how a scope check gets quietly skipped.
    if (scope.counterpartInScope !== true) {
      return refuse(COMMUNICATION_REFUSAL.NOT_IN_SCOPE);
    }
  }

  // Telephony is project-anchored and this conversation has none, so the answer is no before the
  // switch or the permission is even consulted. Said here rather than only in the endpoint,
  // because `ConversationAbilities.canCall` is this same decision and the two must not disagree:
  // an ability that offers a control the endpoint then refuses is exactly the failure abilities
  // exist to prevent, and both clients would otherwise have to ask about the project themselves.
  if (input.action === COMMUNICATION_ACTION.CALL) {
    return refuse(COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT);
  }

  if (input.action === COMMUNICATION_ACTION.PLAY_RECORDING && !input.canPlayRecording) {
    return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }

  return messageAuthorshipRule(input) ?? allow();
}

/**
 * What kind of message an edit or a delete names, once the asker belongs in the conversation.
 *
 * Only ever reached by somebody the conversation already admits, because "that is a system note"
 * and "that one is already withdrawn" are facts about a thread, and a stranger asking about an id
 * should get one answer rather than a menu of them.
 *
 * A missing `message` is refused rather than waved through: this function is the whole judgement,
 * and a caller that forgot to say which message it means must not get a permissive default.
 */
function messageShapeRule(input: CommunicationInput): CommunicationDecision | null {
  if (!MESSAGE_ACTIONS.includes(input.action)) {
    return null;
  }
  const message = input.message;
  if (!message) {
    return refuse(COMMUNICATION_REFUSAL.NO_PERMISSION);
  }
  if (message.isSystemMessage || message.isDeleted) {
    return refuse(COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE);
  }
  return null;
}

/**
 * Whether this message is theirs to change, and whether it is still young enough.
 *
 * Two asymmetries are deliberate, and one of them changed.
 *
 * **Editing is never available on somebody else's message**, with or without oversight: putting
 * words in a colleague's name is not a moderation power, and no permission in this product grants
 * it. That is unchanged, as is the fifteen-minute window, the retained revision and `editedAt`.
 *
 * **Deleting is no longer available to the sender at all.** The requirement is that there is no
 * ordinary user delete: a conversation whose participants may take their own words back at any
 * age is a record of whatever they still want it to say, and the tombstone was doing nothing
 * about that because they chose when it appeared. What remains is the administrative redaction —
 * `conversation:inspect`, `viaOversight: true`, an audit row naming the inspector — which is the
 * one the requirement asks to keep. Whose message it is stops mattering: the inspector may
 * withdraw anybody's, and everybody else may withdraw nobody's, including their own.
 */
function messageAuthorshipRule(input: CommunicationInput): CommunicationDecision | null {
  if (!MESSAGE_ACTIONS.includes(input.action)) {
    return null;
  }
  // `messageShapeRule` ran first and refused a missing one, so this is present.
  const message = input.message as MessageAuthorship;
  if (input.action === COMMUNICATION_ACTION.DELETE) {
    // Deliberately before the authorship test, so a sender and a bystander get the same answer
    // about the same live message: "this is administrative", not "that one is not yours".
    return input.canInspect ? allow(true) : refuse(COMMUNICATION_REFUSAL.DELETE_IS_ADMINISTRATIVE);
  }
  if (!message.isOwnMessage) {
    return refuse(COMMUNICATION_REFUSAL.NOT_THE_AUTHOR);
  }
  if (
    input.action === COMMUNICATION_ACTION.EDIT &&
    message.ageMinutes > MESSAGE_EDIT_WINDOW_MINUTES
  ) {
    return refuse(COMMUNICATION_REFUSAL.EDIT_WINDOW_CLOSED);
  }
  return null;
}

/**
 * The role pairing, when the action names a counterpart.
 *
 * Returns null when there is nothing to check — a project, task or ticket conversation is open to
 * whoever the project admits, so there is no second person to pair with.
 */
function pairingFor(input: CommunicationInput): CommunicationDecision | null {
  const counterpart = input.counterpartProjectRole;
  if (counterpart === undefined) {
    // No second person named. Direct conversations always name one; the open kinds never do.
    return null;
  }
  if (counterpart === null) {
    return refuse(COMMUNICATION_REFUSAL.COUNTERPART_NOT_ON_PROJECT);
  }
  const actor = input.actorProjectRole as ProjectMemberRole;
  if (!DIRECT_ROLE_PAIRINGS[actor].includes(counterpart)) {
    return refuse(COMMUNICATION_REFUSAL.ROLE_PAIR_NOT_ALLOWED);
  }
  if (needsSharedWork(actor, counterpart) && !input.sharedWorkRelationship) {
    return refuse(COMMUNICATION_REFUSAL.NO_SHARED_WORK);
  }
  return null;
}
