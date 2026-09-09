import {
  CONVERSATION_MEMBER_ROLE_LABELS,
  MAX_GROUP_MEMBERS,
  type ConversationDetail,
  type ConversationParticipant,
} from '@ashniva/types';
import { Button, Input } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useGroupMutations, useMessagingDirectoryQuery } from '../scope-api';
import { ConversationAvatar } from './ConversationAvatar';

export interface GroupMembersProps {
  conversation: ConversationDetail;
  onError: (message: string | undefined) => void;
}

/**
 * Who is in a group, and — for whoever administers it — adding and removing people.
 *
 * The picker offers the *messaging directory*, which is the same resolution
 * `POST /conversations/:id/members` enforces: a name it shows is a name that endpoint accepts, and
 * somebody outside the adder's management scope is neither shown nor addable. That check is
 * re-run in the API on every addition — being in a group is not a licence to bring in anybody at
 * all — so this list is a convenience over the answer, never the answer itself.
 *
 * People who have left keep their place, greyed. `leftAt` is set rather than the row deleted, so
 * the thread still reads correctly with their name on the lines they wrote.
 */
export function GroupMembers({ conversation, onError }: GroupMembersProps) {
  const [search, setSearch] = useState('');
  const mutations = useGroupMutations(conversation.id);
  const canManage = conversation.abilities.canManage;
  const directory = useMessagingDirectoryQuery(search, canManage);

  const present = conversation.participants.filter((person) => person.leftAt === null);
  const gone = conversation.participants.filter((person) => person.leftAt !== null);
  const inGroup = new Set(present.map((person) => person.id));
  const full = present.length >= MAX_GROUP_MEMBERS;

  async function run(work: () => Promise<unknown>) {
    onError(undefined);
    try {
      await work();
    } catch (cause) {
      onError(errorMessage(cause));
    }
  }

  return (
    <div className="chat-group__members">
      <ul className="chat-list">
        {present.map((person) => (
          <MemberRow
            key={person.id}
            person={person}
            canRemove={canManage && person.memberRole !== 'OWNER'}
            onRemove={() => void run(() => mutations.removeMember.mutateAsync(person.id))}
          />
        ))}
        {gone.map((person) => (
          <li key={person.id} className="chat-list__item chat-list__item--left">
            <span className="muted">{person.name} · left</span>
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="chat-group__add">
          <Input
            value={search}
            aria-label="Find somebody to add"
            placeholder="Find somebody to add"
            onChange={(event) => setSearch(event.target.value)}
          />
          {full ? (
            <p className="muted">A group holds at most {MAX_GROUP_MEMBERS} people.</p>
          ) : (
            <ul className="chat-list">
              {(directory.data ?? [])
                .filter((contact) => !inGroup.has(contact.id))
                .slice(0, 8)
                .map((contact) => (
                  <li key={contact.id} className="chat-list__item">
                    <span>
                      {contact.name}
                      <span className="timeline__note"> · {contact.reason}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void run(async () => {
                          await mutations.addMember.mutateAsync({ userId: contact.id });
                          setSearch('');
                        })
                      }
                    >
                      Add
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One member.
 *
 * The owner has no Remove button because the API refuses it — an administrator may not remove the
 * person who made the group — and offering one that always answers 403 is worse than none.
 */
function MemberRow({
  person,
  canRemove,
  onRemove,
}: {
  person: ConversationParticipant;
  canRemove: boolean;
  onRemove: () => void;
}) {
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
      {canRemove ? (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      ) : null}
    </li>
  );
}
