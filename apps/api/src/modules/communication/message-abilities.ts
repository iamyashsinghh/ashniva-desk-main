import { COMMUNICATION_ACTION, type MessageAuthorship } from '@ashniva/types';

import type { CommunicationResolver } from './communication-policy.service';
import type { MessageAbilities } from './communication.mapper';
import type { MessageRow } from './conversations.repository';

/**
 * The facts about one message that an edit or a delete turns on.
 *
 * The age is computed here, against one `now` for the whole page, so fifty messages of a single
 * response are all judged against the same instant. `canCommunicate` itself takes minutes rather
 * than a clock precisely so this is the only place the time is read.
 */
export function authorshipOf(
  message: MessageRow,
  actorUserId: string,
  now: Date,
): MessageAuthorship {
  return {
    isOwnMessage: message.senderId === actorUserId,
    isSystemMessage: message.systemKind !== null,
    isDeleted: message.deletedAt !== null,
    ageMinutes: Math.floor((now.getTime() - message.createdAt.getTime()) / 60_000),
  };
}

/**
 * What this caller may do to this message, asked of the same pure function the endpoints ask.
 *
 * Not a second implementation and deliberately not a shortcut: a control the screen offers and a
 * request the API accepts have to be the same decision, and the way to guarantee that is for the
 * screen's answer to come from the decision itself rather than from a rule that resembles it.
 */
export function abilitiesOf(
  resolver: CommunicationResolver,
  message: MessageRow,
  actorUserId: string,
  now: Date,
): MessageAbilities {
  const authorship = authorshipOf(message, actorUserId, now);
  return {
    canEdit: resolver.decide(COMMUNICATION_ACTION.EDIT, authorship).allowed,
    canDelete: resolver.decide(COMMUNICATION_ACTION.DELETE, authorship).allowed,
  };
}
