import { CONVERSATION_MEMBER_ROLE_LABELS, type ConversationDetail, type ConversationParticipant } from '@ashniva/types';

import { ConversationAvatar } from './ConversationAvatar';

export interface GroupMembersProps {
  conversation: ConversationDetail;
  onError: (message: string | undefined) => void;
}

/**
 * Who is in a group.
 *
 * Membership is the project's team, kept in sync on the server. This list is read-only so nobody
 * can delete a person from the chat without taking them off the project.
 */
export function GroupMembers({ conversation }: GroupMembersProps) {
  const present = conversation.participants.filter((person) => person.leftAt === null);
  const gone = conversation.participants.filter((person) => person.leftAt !== null);

  return (
    <div className="chat-group__members">
      <ul className="chat-list">
        {present.map((person) => (
          <MemberRow key={person.id} person={person} />
        ))}
        {gone.map((person) => (
          <li key={person.id} className="chat-list__item chat-list__item--left">
            <span className="muted">{person.name} · left</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberRow({ person }: { person: ConversationParticipant }) {
  return (
    <li className="chat-list__item">
      <span className="chat-list__person">
        <ConversationAvatar name={person.name} imageFileId={null} size="sm" />
        {person.name}
        <span className="timeline__note">
          {' '}
          · {CONVERSATION_MEMBER_ROLE_LABELS[person.memberRole]}
        </span>
      </span>
    </li>
  );
}
