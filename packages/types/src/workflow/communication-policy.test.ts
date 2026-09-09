import {
  COMMUNICATION_ACTION,
  COMMUNICATION_REFUSAL,
  DIRECT_ROLE_PAIRINGS,
  canCommunicate,
  needsSharedWork,
  pairingIsSymmetric,
  type CommunicationAction,
  type CommunicationInput,
  type MessageAuthorship,
} from './communication-policy';
import { MESSAGE_EDIT_WINDOW_MINUTES } from '../domain/conversation';
import { PROJECT_MEMBER_ROLE } from '../domain/project-member-role';

/**
 * Who may talk to whom.
 *
 * This is the file that decides whether a developer on one project can reach a developer on
 * another, so every branch is exercised here rather than only through the API. The API can show
 * that *a* refusal happened; these tests are what say the refusals are the right ones — and, just
 * as important, that the permitted cases are permitted, because a policy that refuses everything
 * is not secure, it is broken.
 */

function input(over: Partial<CommunicationInput> = {}): CommunicationInput {
  return {
    action: COMMUNICATION_ACTION.POST,
    isInternal: true,
    sameTenant: true,
    actorProjectRole: PROJECT_MEMBER_ROLE.DEVELOPER,
    chatEnabled: true,
    callingEnabled: true,
    canParticipate: true,
    canCall: true,
    canInspect: false,
    canPlayRecording: false,
    ...over,
  };
}

describe('canCommunicate — the boundary', () => {
  it('refuses a client before anything else is considered', () => {
    const decision = canCommunicate(
      input({
        isInternal: false,
        actorProjectRole: PROJECT_MEMBER_ROLE.MANAGER,
        canInspect: true,
        canParticipate: true,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_INTERNAL);
  });

  it('refuses another tenant even for somebody on a project of that name', () => {
    const decision = canCommunicate(input({ sameTenant: false }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_SAME_TENANT);
  });

  it('refuses somebody who is not on the project', () => {
    const decision = canCommunicate(input({ actorProjectRole: null }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_ON_PROJECT);
  });

  it('refuses somebody on the project without the participate permission', () => {
    const decision = canCommunicate(input({ canParticipate: false }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });

  it('admits a project member posting in an open conversation', () => {
    expect(canCommunicate(input())).toEqual({ allowed: true, reason: null, viaOversight: false });
  });
});

describe('canCommunicate — the role pairings', () => {
  it('lets a developer open a direct conversation with the project lead', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        actorProjectRole: PROJECT_MEMBER_ROLE.DEVELOPER,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.LEAD,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('lets a developer open one with the project manager', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.MANAGER,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('refuses a developer reaching another developer, even on the same project', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.DEVELOPER,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.ROLE_PAIR_NOT_ALLOWED);
  });

  it('refuses when the other person is on no shared project at all', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        counterpartProjectRole: null,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.COUNTERPART_NOT_ON_PROJECT);
  });

  it('lets a tester reach the developer whose work they are testing', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        actorProjectRole: PROJECT_MEMBER_ROLE.TESTER,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.DEVELOPER,
        sharedWorkRelationship: true,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('refuses a tester reaching a developer they share no work with', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        actorProjectRole: PROJECT_MEMBER_ROLE.TESTER,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.DEVELOPER,
        sharedWorkRelationship: false,
      }),
    );

    expect(decision.allowed).toBe(false);
    // Not "your roles do not pair" — they do. The working relationship is what is missing, and
    // that is something that can come to exist tomorrow.
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_SHARED_WORK);
  });

  it('lets a lead reach every working role on their project', () => {
    for (const counterpart of [
      PROJECT_MEMBER_ROLE.DEVELOPER,
      PROJECT_MEMBER_ROLE.TESTER,
      PROJECT_MEMBER_ROLE.MANAGER,
      PROJECT_MEMBER_ROLE.SUPPORT,
    ]) {
      const decision = canCommunicate(
        input({
          action: COMMUNICATION_ACTION.CREATE,
          actorProjectRole: PROJECT_MEMBER_ROLE.LEAD,
          counterpartProjectRole: counterpart,
        }),
      );
      expect({ counterpart, allowed: decision.allowed }).toEqual({ counterpart, allowed: true });
    }
  });

  it('pairs a client contact with nobody', () => {
    expect(DIRECT_ROLE_PAIRINGS.CLIENT_CONTACT).toHaveLength(0);
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.CREATE,
        actorProjectRole: PROJECT_MEMBER_ROLE.MANAGER,
        counterpartProjectRole: PROJECT_MEMBER_ROLE.CLIENT_CONTACT,
      }),
    );

    expect(decision.allowed).toBe(false);
  });

  it('keeps the pairing table symmetric', () => {
    // A one-sided pairing would let A open a conversation B could not have opened. That is not a
    // relationship; it is a leak with an extra step.
    expect(pairingIsSymmetric()).toBe(true);
  });

  it('marks developer and tester as the conditional pair, and only them', () => {
    expect(needsSharedWork(PROJECT_MEMBER_ROLE.DEVELOPER, PROJECT_MEMBER_ROLE.TESTER)).toBe(true);
    expect(needsSharedWork(PROJECT_MEMBER_ROLE.TESTER, PROJECT_MEMBER_ROLE.DEVELOPER)).toBe(true);
    expect(needsSharedWork(PROJECT_MEMBER_ROLE.DEVELOPER, PROJECT_MEMBER_ROLE.LEAD)).toBe(false);
    expect(needsSharedWork(PROJECT_MEMBER_ROLE.MANAGER, PROJECT_MEMBER_ROLE.TESTER)).toBe(false);
  });
});

describe('canCommunicate — the switches', () => {
  it('stops posting when chat is switched off, but not reading', () => {
    expect(canCommunicate(input({ chatEnabled: false })).reason).toBe(
      COMMUNICATION_REFUSAL.CHAT_DISABLED,
    );
    expect(
      canCommunicate(input({ chatEnabled: false, action: COMMUNICATION_ACTION.READ })).allowed,
    ).toBe(true);
  });

  it('stops calling independently of chat', () => {
    const decision = canCommunicate(
      input({ action: COMMUNICATION_ACTION.CALL, callingEnabled: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.CALLING_DISABLED);
    // Chat still works, which is the point of two switches.
    expect(canCommunicate(input({ callingEnabled: false })).allowed).toBe(true);
  });

  it('refuses a call to somebody without the call permission', () => {
    const decision = canCommunicate(input({ action: COMMUNICATION_ACTION.CALL, canCall: false }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });

  it('refuses playback to a member without the playback permission', () => {
    const decision = canCommunicate(
      input({ action: COMMUNICATION_ACTION.PLAY_RECORDING, canPlayRecording: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });
});

describe('canCommunicate — oversight', () => {
  const inspector = (over: Partial<CommunicationInput> = {}) =>
    input({ actorProjectRole: null, canInspect: true, canParticipate: false, ...over });

  it('lets an inspector read a project they are not on, and says it was oversight', () => {
    const decision = canCommunicate(inspector({ action: COMMUNICATION_ACTION.READ }));

    expect(decision.allowed).toBe(true);
    // The caller uses this to audit the access as an inspection rather than as ordinary reading.
    expect(decision.viaOversight).toBe(true);
  });

  it('refuses an inspector who tries to post', () => {
    const decision = canCommunicate(inspector({ action: COMMUNICATION_ACTION.POST }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
  });

  it('refuses an inspector who tries to call', () => {
    expect(canCommunicate(inspector({ action: COMMUNICATION_ACTION.CALL })).reason).toBe(
      COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY,
    );
  });

  it('still needs the playback permission for a recording', () => {
    expect(canCommunicate(inspector({ action: COMMUNICATION_ACTION.PLAY_RECORDING })).reason).toBe(
      COMMUNICATION_REFUSAL.NO_PERMISSION,
    );
    expect(
      canCommunicate(
        inspector({ action: COMMUNICATION_ACTION.PLAY_RECORDING, canPlayRecording: true }),
      ).allowed,
    ).toBe(true);
  });

  it('refuses the inspect action itself without the permission', () => {
    const decision = canCommunicate(
      input({ action: COMMUNICATION_ACTION.INSPECT, canInspect: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });

  it('never lets oversight cross a tenant', () => {
    const decision = canCommunicate(
      input({ action: COMMUNICATION_ACTION.INSPECT, canInspect: true, sameTenant: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_SAME_TENANT);
  });

  it('never lets a client hold oversight', () => {
    const decision = canCommunicate(
      input({ action: COMMUNICATION_ACTION.INSPECT, canInspect: true, isInternal: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_INTERNAL);
  });

  it('treats an inspector who is also a member as an ordinary member', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.POST,
        actorProjectRole: PROJECT_MEMBER_ROLE.MANAGER,
        canInspect: true,
      }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.viaOversight).toBe(false);
  });
});

/**
 * Editing and deleting, which are the only two questions here whose answer differs between two
 * messages of the same conversation.
 *
 * The asymmetry between them is the point and is asserted from both sides: an inspector may take
 * a colleague's message down and may never rewrite it, because putting words in somebody's name
 * is not a moderation power this product grants to anybody.
 */
function ownMessage(over: Partial<MessageAuthorship> = {}): MessageAuthorship {
  return {
    isOwnMessage: true,
    isSystemMessage: false,
    isDeleted: false,
    ageMinutes: 1,
    ...over,
  };
}

describe('canCommunicate — editing a message', () => {
  const edit = (over: Partial<CommunicationInput> = {}, message = ownMessage()) =>
    canCommunicate(input({ action: COMMUNICATION_ACTION.EDIT, message, ...over }));

  it('lets the sender rewrite their own message inside the window', () => {
    expect(edit().allowed).toBe(true);
  });

  it('refuses a message old enough that somebody may have acted on it', () => {
    const decision = edit({}, ownMessage({ ageMinutes: MESSAGE_EDIT_WINDOW_MINUTES + 1 }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.EDIT_WINDOW_CLOSED);
  });

  it('allows the last minute of the window and refuses the one after it', () => {
    expect(edit({}, ownMessage({ ageMinutes: MESSAGE_EDIT_WINDOW_MINUTES })).allowed).toBe(true);
    expect(edit({}, ownMessage({ ageMinutes: MESSAGE_EDIT_WINDOW_MINUTES + 1 })).allowed).toBe(
      false,
    );
  });

  it('refuses somebody else’s message', () => {
    const decision = edit({}, ownMessage({ isOwnMessage: false }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_THE_AUTHOR);
  });

  it('refuses somebody else’s message to an inspector too', () => {
    // The one place oversight is narrower than it looks: it may remove, and never rewrite.
    const decision = edit(
      { canInspect: true, actorProjectRole: PROJECT_MEMBER_ROLE.MANAGER },
      ownMessage({ isOwnMessage: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_THE_AUTHOR);
  });

  it('refuses a system note and an already-withdrawn message', () => {
    expect(edit({}, ownMessage({ isSystemMessage: true, isOwnMessage: false })).reason).toBe(
      COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE,
    );
    expect(edit({}, ownMessage({ isDeleted: true })).reason).toBe(
      COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE,
    );
  });

  it('refuses somebody who has left the project, however fresh their message', () => {
    // The property the whole package rests on, applied to editing: losing the relationship loses
    // the ability to rewrite the record of it.
    const decision = edit({ actorProjectRole: null });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_ON_PROJECT);
  });

  it('stops when chat is switched off, because an edit is a post rewritten', () => {
    expect(edit({ chatEnabled: false }).reason).toBe(COMMUNICATION_REFUSAL.CHAT_DISABLED);
  });

  it('refuses an inspector who is not on the project at all', () => {
    const decision = edit({ actorProjectRole: null, canInspect: true });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
  });

  it('refuses when the caller did not say which message it means', () => {
    const decision = canCommunicate(input({ action: COMMUNICATION_ACTION.EDIT }));

    expect(decision.allowed).toBe(false);
  });
});

describe('canCommunicate — withdrawing a message', () => {
  const remove = (over: Partial<CommunicationInput> = {}, message = ownMessage()) =>
    canCommunicate(input({ action: COMMUNICATION_ACTION.DELETE, message, ...over }));

  it('refuses the sender their own message, at any age', () => {
    // Inverted deliberately. There is no ordinary user delete any more: a conversation whose
    // participants may take their own words back whenever they like is a record of whatever they
    // still want it to say, and the tombstone was doing nothing about that because they chose
    // when it appeared. Withdrawing is administrative, and this is what everybody else is told.
    const fresh = remove({}, ownMessage({ ageMinutes: 0 }));
    const old = remove({}, ownMessage({ ageMinutes: 60 * 24 * 30 }));

    expect([fresh.allowed, old.allowed]).toEqual([false, false]);
    expect(fresh.reason).toBe(COMMUNICATION_REFUSAL.DELETE_IS_ADMINISTRATIVE);
    expect(old.reason).toBe(COMMUNICATION_REFUSAL.DELETE_IS_ADMINISTRATIVE);
  });

  it('gives a sender and a bystander the same answer about the same live message', () => {
    // The refusal must not say whose message it is: "that one is not yours" and "you may not
    // withdraw yours either" would let somebody establish authorship of a message they can
    // already read, and the distinction no longer decides anything.
    const mine = remove({}, ownMessage());
    const theirs = remove({}, ownMessage({ isOwnMessage: false }));

    expect(theirs.reason).toBe(mine.reason);
    expect(theirs.reason).toBe(COMMUNICATION_REFUSAL.DELETE_IS_ADMINISTRATIVE);
  });

  it('lets an inspector who is not on the project remove one, and marks it as oversight', () => {
    const decision = remove(
      { actorProjectRole: null, canInspect: true },
      ownMessage({ isOwnMessage: false }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.viaOversight).toBe(true);
  });

  it('marks an inspector who is also a member the same way when the message is not theirs', () => {
    const decision = remove(
      { actorProjectRole: PROJECT_MEMBER_ROLE.MANAGER, canInspect: true },
      ownMessage({ isOwnMessage: false }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.viaOversight).toBe(true);
  });

  it('survives chat being switched off, which is often when a message needs removing', () => {
    // Still true, and still for the same reason — an organization that has just switched chat off
    // is often doing it precisely because something needs removing. The holder of the permission
    // is who it survives for now.
    expect(remove({ chatEnabled: false, canInspect: true }).allowed).toBe(true);
  });

  it('refuses a member who has left the project', () => {
    expect(remove({ actorProjectRole: null }).reason).toBe(COMMUNICATION_REFUSAL.NOT_ON_PROJECT);
  });

  it('refuses a message that is already gone', () => {
    expect(remove({ canInspect: true }, ownMessage({ isDeleted: true })).reason).toBe(
      COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE,
    );
  });

  it('refuses a client, whatever else they hold', () => {
    expect(remove({ isInternal: false, canInspect: true }).reason).toBe(
      COMMUNICATION_REFUSAL.NOT_INTERNAL,
    );
  });

  it('refuses an inspector a message that is already gone', () => {
    // Oversight is the one write admitted here, and it still cannot withdraw a tombstone twice.
    const decision = remove(
      { actorProjectRole: null, canInspect: true },
      ownMessage({ isOwnMessage: false, isDeleted: true }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE);
  });

  it('refuses an inspector a system note, which has nobody to speak for it', () => {
    expect(
      remove(
        { actorProjectRole: null, canInspect: true },
        ownMessage({ isOwnMessage: false, isSystemMessage: true }),
      ).reason,
    ).toBe(COMMUNICATION_REFUSAL.MESSAGE_NOT_EDITABLE);
  });
});

/**
 * What a refusal is allowed to tell somebody who does not belong in the conversation.
 *
 * A refusal that varies with the message names a fact about a thread the asker was never admitted
 * to: "that is a system note", "that one is already withdrawn", "that one is somebody else's".
 * Three answers is an oracle; one answer is a refusal. The API closes the same door a second time
 * by deciding the read before it ever looks the message up, but the policy must not be the thing
 * that opens it.
 */
describe('canCommunicate — a refusal says nothing about the message', () => {
  const stranger = (
    message: MessageAuthorship,
    action: CommunicationAction = COMMUNICATION_ACTION.DELETE,
  ) => canCommunicate(input({ action, message, actorProjectRole: null }));

  it('answers a non-member the same way whatever kind of message they name', () => {
    const answers = [
      ownMessage(),
      ownMessage({ isOwnMessage: false }),
      ownMessage({ isSystemMessage: true, isOwnMessage: false }),
      ownMessage({ isDeleted: true }),
    ].map((message) => stranger(message).reason);

    expect(answers).toEqual([
      COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
      COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
      COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
      COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
    ]);
  });

  it('does the same for an edit', () => {
    expect(stranger(ownMessage({ isDeleted: true }), COMMUNICATION_ACTION.EDIT).reason).toBe(
      COMMUNICATION_REFUSAL.NOT_ON_PROJECT,
    );
  });

  it('tells a member without the permission only that, and nothing about the message', () => {
    const decision = canCommunicate(
      input({
        action: COMMUNICATION_ACTION.DELETE,
        message: ownMessage({ isSystemMessage: true, isOwnMessage: false }),
        canParticipate: false,
      }),
    );

    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });
});

/**
 * The scope kinds, and the promise that they changed nothing about the project-anchored ones.
 *
 * Two claims are being made and both need proving separately. The first is that a conversation
 * with no project is judged on management scope and on a member list. The second — the one that
 * matters more, because it is the thing that could break silently — is that a conversation *with*
 * a project reaches exactly the code it always did: `scopeDecision` is unreachable for it, and its
 * answers are byte-for-byte what they were before the branch existed.
 */
describe('canCommunicate — a conversation with a project is untouched', () => {
  const EVERY_ACTION = Object.values(COMMUNICATION_ACTION);

  it('never answers with a scope refusal, whatever action is asked and whoever asks', () => {
    // The scope branch is selected by the presence of a scope context, which the API builds only
    // for a row whose `project_id` is null (`ConversationsService.contextOf`). So the property to
    // hold here is that the project-anchored path has no way to reach a scope answer: every one of
    // these codes appearing would mean the branch had leaked. The rest of this file — three
    // hundred assertions written before the scope kinds existed and unchanged by them — is what
    // pins the answers themselves.
    const SCOPE_ONLY = [
      COMMUNICATION_REFUSAL.NOT_IN_SCOPE,
      COMMUNICATION_REFUSAL.NOT_A_MEMBER,
      COMMUNICATION_REFUSAL.NOT_GROUP_ADMIN,
      COMMUNICATION_REFUSAL.NOT_A_GROUP,
    ];
    const message: MessageAuthorship = {
      isOwnMessage: true,
      isSystemMessage: false,
      isDeleted: false,
      ageMinutes: 1,
    };
    for (const action of EVERY_ACTION) {
      for (const actorProjectRole of [
        null,
        PROJECT_MEMBER_ROLE.MANAGER,
        PROJECT_MEMBER_ROLE.DEVELOPER,
      ]) {
        for (const canInspect of [false, true]) {
          const decision = canCommunicate(input({ action, message, actorProjectRole, canInspect }));
          const leaked = SCOPE_ONLY.find((reason) => reason === decision.reason) ?? null;

          expect({ action, actorProjectRole, canInspect, leaked }).toEqual({
            action,
            actorProjectRole,
            canInspect,
            leaked: null,
          });
        }
      }
    }
  });

  it('still refuses an inspector who is not on the project every write', () => {
    for (const action of [
      COMMUNICATION_ACTION.CREATE,
      COMMUNICATION_ACTION.POST,
      COMMUNICATION_ACTION.ADD_PARTICIPANT,
      COMMUNICATION_ACTION.CALL,
    ]) {
      const decision = canCommunicate(input({ action, actorProjectRole: null, canInspect: true }));

      expect({ action, reason: decision.reason }).toEqual({
        action,
        reason: COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY,
      });
    }
  });
});

describe('canCommunicate — a conversation with no project', () => {
  const scoped = (
    over: Partial<CommunicationInput> = {},
    scope: Partial<NonNullable<CommunicationInput['scope']>> = {},
  ) =>
    canCommunicate(
      input({
        action: COMMUNICATION_ACTION.POST,
        actorProjectRole: null,
        scope: {
          membership: 'PAIR',
          isListedMember: true,
          memberRole: null,
          ...scope,
        },
        ...over,
      }),
    );

  it('admits a member of the list and refuses everybody else', () => {
    expect(scoped().allowed).toBe(true);
    expect(scoped({}, { isListedMember: false }).reason).toBe(COMMUNICATION_REFUSAL.NOT_A_MEMBER);
  });

  it('refuses a client before the list is even looked at', () => {
    expect(scoped({ isInternal: false }).reason).toBe(COMMUNICATION_REFUSAL.NOT_INTERNAL);
  });

  it('refuses a member without conversation:participate', () => {
    expect(scoped({ canParticipate: false }).reason).toBe(COMMUNICATION_REFUSAL.NO_PERMISSION);
  });

  it('lets somebody create one only with people inside their reach', () => {
    const create = (counterpartInScope: boolean) =>
      scoped(
        { action: COMMUNICATION_ACTION.CREATE },
        { isListedMember: false, counterpartInScope },
      );

    expect(create(true).allowed).toBe(true);
    expect(create(false).reason).toBe(COMMUNICATION_REFUSAL.NOT_IN_SCOPE);
  });

  it('closes a pair when the reach that opened it goes', () => {
    // The initiator carries the re-check, so a manager who stops managing the project stops
    // reaching the colleague they reached through it — on reading as well as on posting.
    for (const action of [COMMUNICATION_ACTION.READ, COMMUNICATION_ACTION.POST]) {
      expect(scoped({ action }, { counterpartInScope: false }).reason).toBe(
        COMMUNICATION_REFUSAL.NOT_IN_SCOPE,
      );
    }
  });

  it('lets a group administrator add somebody they reach, and nobody else', () => {
    const add = (memberRole: 'OWNER' | 'ADMIN' | 'MEMBER', counterpartInScope: boolean) =>
      scoped(
        { action: COMMUNICATION_ACTION.ADD_PARTICIPANT },
        { membership: 'LISTED', memberRole, counterpartInScope },
      );

    expect(add('OWNER', true).allowed).toBe(true);
    expect(add('ADMIN', true).allowed).toBe(true);
    expect(add('MEMBER', true).reason).toBe(COMMUNICATION_REFUSAL.NOT_GROUP_ADMIN);
    // Being in the group is not a licence to bring in anybody at all.
    expect(add('ADMIN', false).reason).toBe(COMMUNICATION_REFUSAL.NOT_IN_SCOPE);
  });

  it('refuses adding a third person to a pair', () => {
    expect(
      scoped(
        { action: COMMUNICATION_ACTION.ADD_PARTICIPANT },
        { membership: 'PAIR', counterpartInScope: true },
      ).reason,
    ).toBe(COMMUNICATION_REFUSAL.NOT_A_GROUP);
  });

  it('gives an inspector who is not in it a read and no more', () => {
    const outside = { isListedMember: false } as const;

    expect(scoped({ action: COMMUNICATION_ACTION.READ, canInspect: true }, outside)).toEqual({
      allowed: true,
      reason: null,
      viaOversight: true,
    });
    expect(scoped({ action: COMMUNICATION_ACTION.POST, canInspect: true }, outside).reason).toBe(
      COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY,
    );
    expect(
      scoped({ action: COMMUNICATION_ACTION.ADD_PARTICIPANT, canInspect: true }, outside).reason,
    ).toBe(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
  });

  it('lets an inspector withdraw a message here as well, marked as oversight', () => {
    const decision = scoped(
      {
        action: COMMUNICATION_ACTION.DELETE,
        canInspect: true,
        message: {
          isOwnMessage: false,
          isSystemMessage: false,
          isDeleted: false,
          ageMinutes: 5,
        },
      },
      { isListedMember: false },
    );

    expect(decision).toEqual({ allowed: true, reason: null, viaOversight: true });
  });

  it('refuses a member withdrawing their own message, exactly as on a project thread', () => {
    const decision = scoped({
      action: COMMUNICATION_ACTION.DELETE,
      message: { isOwnMessage: true, isSystemMessage: false, isDeleted: false, ageMinutes: 1 },
    });

    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.DELETE_IS_ADMINISTRATIVE);
  });

  it('keeps the fifteen-minute edit window and the sender-only rule', () => {
    const edit = (message: Partial<MessageAuthorship>) =>
      scoped({
        action: COMMUNICATION_ACTION.EDIT,
        message: {
          isOwnMessage: true,
          isSystemMessage: false,
          isDeleted: false,
          ageMinutes: 1,
          ...message,
        },
      });

    expect(edit({}).allowed).toBe(true);
    expect(edit({ ageMinutes: MESSAGE_EDIT_WINDOW_MINUTES + 1 }).reason).toBe(
      COMMUNICATION_REFUSAL.EDIT_WINDOW_CLOSED,
    );
    expect(edit({ isOwnMessage: false }).reason).toBe(COMMUNICATION_REFUSAL.NOT_THE_AUTHOR);
  });

  it('refuses a call, because telephony is anchored to a project this kind does not have', () => {
    // The ability the API publishes is this decision, and the call endpoint refuses the same case
    // before it consults anything else. Saying it here is what keeps the two from disagreeing.
    const decision = scoped({ action: COMMUNICATION_ACTION.CALL, callingEnabled: true });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT);
  });

  it('stops writing when chat is switched off, and still reads', () => {
    expect(scoped({ chatEnabled: false }).reason).toBe(COMMUNICATION_REFUSAL.CHAT_DISABLED);
    expect(scoped({ action: COMMUNICATION_ACTION.READ, chatEnabled: false }).allowed).toBe(true);
  });
});

/**
 * A task conversation, which is narrower than the project it hangs off.
 *
 * `taskRelationship` is the only new fact in this file, and the whole of what it changes is stated
 * here: absent, every decision is exactly the one it was before; `false`, somebody on the project
 * is not in this room; `true`, they are still subject to everything else.
 */
describe('canCommunicate — a task conversation', () => {
  const onTask = (over: Partial<CommunicationInput> = {}) =>
    canCommunicate(input({ taskRelationship: true, ...over }));
  const offTask = (over: Partial<CommunicationInput> = {}) =>
    canCommunicate(input({ taskRelationship: false, ...over }));

  it('admits somebody with a place on the task', () => {
    expect(onTask({ action: COMMUNICATION_ACTION.READ }).allowed).toBe(true);
    expect(onTask({ action: COMMUNICATION_ACTION.POST }).allowed).toBe(true);
  });

  it('refuses a project member with no place on it, and says which fact is missing', () => {
    const decision = offTask({ action: COMMUNICATION_ACTION.READ });

    expect(decision.allowed).toBe(false);
    // Not `NOT_ON_PROJECT`: they are on the project, and telling them otherwise would send them to
    // ask for something they already have.
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_ON_TASK);
  });

  it('refuses every action, not only reading', () => {
    for (const action of Object.values(COMMUNICATION_ACTION)) {
      if (action === COMMUNICATION_ACTION.INSPECT) {
        continue;
      }
      expect(offTask({ action }).allowed).toBe(false);
    }
  });

  it('still refuses somebody who is on the task but not on the project', () => {
    // Both facts are required, and this is the one a fix could easily have widened: an assignee
    // who has been taken off the project stays out until they are put back on it.
    const decision = onTask({ action: COMMUNICATION_ACTION.READ, actorProjectRole: null });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(COMMUNICATION_REFUSAL.NOT_ON_PROJECT);
  });

  it('leaves oversight exactly where it was: read-only, flagged, and not widened', () => {
    const read = offTask({ action: COMMUNICATION_ACTION.READ, canInspect: true });
    expect(read.allowed).toBe(true);
    expect(read.viaOversight).toBe(true);

    const post = offTask({ action: COMMUNICATION_ACTION.POST, canInspect: true });
    expect(post.allowed).toBe(false);
    expect(post.reason).toBe(COMMUNICATION_REFUSAL.OVERSIGHT_IS_READ_ONLY);
  });

  it('does not let the participate permission stand in for a place on the task', () => {
    expect(offTask({ action: COMMUNICATION_ACTION.READ, canParticipate: true }).reason).toBe(
      COMMUNICATION_REFUSAL.NOT_ON_TASK,
    );
  });

  it('changes nothing at all when the conversation names no task', () => {
    // The regression guard for every other kind: an undefined `taskRelationship` has to be the
    // same decision as one taken before the field existed.
    for (const action of Object.values(COMMUNICATION_ACTION)) {
      const message = {
        isOwnMessage: true,
        isSystemMessage: false,
        isDeleted: false,
        ageMinutes: 1,
      };
      expect(canCommunicate(input({ action, message }))).toEqual(
        canCommunicate(input({ action, message, taskRelationship: undefined })),
      );
    }
  });
});
