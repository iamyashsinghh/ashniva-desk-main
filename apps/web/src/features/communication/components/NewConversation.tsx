import {
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_GROUP_MEMBERS,
  PROJECT_MEMBER_ROLE_LABELS,
  CONVERSATION_KIND,
  type MessagingScopeContact,
} from '@ashniva/types';
import { Button, EmptyState, Input, Modal, Tabs } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { useContactsQuery, useOpenConversation } from '../api';
import { useMessagingDirectoryQuery, useScopeConversationMutations } from '../scope-api';

export interface NewConversationProps {
  open: boolean;
  onClose: () => void;
  onOpened: (conversationId: string) => void;
}

type NewConversationTab = 'direct' | 'group' | 'project';

/**
 * Starting something: a direct message, or a group.
 *
 * Two different sources of permission sit side by side here, and the tabs are the honest way to
 * show that. **Project contacts** are people the caller shares a project with and whose roles the
 * pairing table admits — that has always existed and is untouched. **The directory** is the new
 * one: people inside the caller's *management scope*, which for a developer or a tester is nobody
 * at all, and the entry says which relationship puts them there rather than leaving somebody to
 * guess why a colleague is missing.
 *
 * Neither list is authorization. Both come from the same resolution the create endpoints enforce,
 * so a name shown is a name they accept — and a request for a name that was never shown is
 * refused in the API, not here.
 */
export function NewConversation({ open, onClose, onOpened }: NewConversationProps) {
  const [error, setError] = useState<string | undefined>();
  const [tab, setTab] = useState<NewConversationTab>('direct');

  async function opened(work: () => Promise<{ id: string }>) {
    setError(undefined);
    try {
      const conversation = await work();
      onOpened(conversation.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Modal open={open} title="Start a conversation" onClose={onClose} size="md">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Tabs
        aria-label="How to start a conversation"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'direct', label: 'Direct message' },
          { key: 'group', label: 'Group' },
          { key: 'project', label: 'On a project' },
        ]}
      />
      {tab === 'direct' ? <DirectTab onStart={opened} /> : null}
      {tab === 'group' ? <GroupTab onStart={opened} /> : null}
      {tab === 'project' ? <ProjectContactsTab onStart={opened} /> : null}
    </Modal>
  );
}

type Start = (work: () => Promise<{ id: string }>) => Promise<void>;

/** Somebody inside the caller's management scope, and why they are inside it. */
function DirectTab({ onStart }: { onStart: Start }) {
  const [search, setSearch] = useState('');
  const directory = useMessagingDirectoryQuery(search);
  const { openDirect } = useScopeConversationMutations();

  return (
    <div className="chat-new">
      <Input
        type="search"
        value={search}
        aria-label="Find somebody to message"
        placeholder="Find somebody"
        onChange={(event) => setSearch(event.target.value)}
      />
      <QueryState
        isLoading={directory.isLoading}
        isError={directory.isError}
        error={directory.error}
        onRetry={() => void directory.refetch()}
      >
        {(directory.data ?? []).length === 0 ? (
          <EmptyState
            title="Nobody outside a project"
            description="Reaching somebody without a shared project comes from managing or leading them. Use the project tab for the people you work with."
          />
        ) : (
          <ul className="chat-list">
            {(directory.data ?? []).map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                onStart={() => void onStart(() => openDirect.mutateAsync(contact.id))}
              />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function ContactRow({ contact, onStart }: { contact: MessagingScopeContact; onStart: () => void }) {
  return (
    <li className="chat-list__item">
      <span>
        {contact.name}
        <span className="timeline__note"> · {contact.reason}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={onStart}>
        {contact.conversationId ? 'Open' : 'Message'}
      </Button>
    </li>
  );
}

/** A named group of people, all of whom the server re-checks against the creator's scope. */
function GroupTab({ onStart }: { onStart: Start }) {
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<MessagingScopeContact[]>([]);
  const directory = useMessagingDirectoryQuery(search);
  const { createGroup } = useScopeConversationMutations();

  const named = title.trim();
  // One less than the maximum: the person creating it is in it too.
  const room = chosen.length < MAX_GROUP_MEMBERS - 1;
  const ready = named.length > 0 && chosen.length > 0;

  return (
    <div className="chat-new">
      <Input
        value={title}
        aria-label="Group name"
        placeholder="What is this group for?"
        maxLength={MAX_CONVERSATION_TITLE_LENGTH}
        onChange={(event) => setTitle(event.target.value)}
      />

      {chosen.length > 0 ? (
        <ul className="chat-new__chosen">
          {chosen.map((contact) => (
            <li key={contact.id}>
              {contact.name}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setChosen((current) => current.filter((entry) => entry.id !== contact.id))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        type="search"
        value={search}
        aria-label="Find somebody to add"
        placeholder="Add people"
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="chat-list">
        {(directory.data ?? [])
          .filter((contact) => !chosen.some((entry) => entry.id === contact.id))
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
                disabled={!room}
                disabledReason={`A group holds at most ${MAX_GROUP_MEMBERS} people`}
                onClick={() => setChosen((current) => [...current, contact])}
              >
                Add
              </Button>
            </li>
          ))}
      </ul>

      <Button
        variant="primary"
        disabled={!ready}
        disabledReason="A group needs a name and at least one other person"
        onClick={() =>
          void onStart(() =>
            createGroup.mutateAsync({
              title: named,
              memberIds: chosen.map((contact) => contact.id),
            }),
          )
        }
      >
        Create group
      </Button>
    </div>
  );
}

/**
 * The people the caller shares a project with.
 *
 * Unchanged from what the messages screen already offered, moved in beside the new tabs so that
 * "start a conversation" is one place rather than two.
 */
function ProjectContactsTab({ onStart }: { onStart: Start }) {
  const contacts = useContactsQuery();
  const open = useOpenConversation();

  return (
    <QueryState
      isLoading={contacts.isLoading}
      isError={contacts.isError}
      error={contacts.error}
      onRetry={() => void contacts.refetch()}
    >
      {(contacts.data ?? []).length === 0 ? (
        <EmptyState
          title="Nobody to message yet"
          description="You can message people on your own projects whose role pairs with yours."
        />
      ) : (
        <ul className="chat-list">
          {(contacts.data ?? []).map((contact) => (
            <li key={`${contact.projectId}:${contact.id}`} className="chat-list__item">
              <span>
                {contact.name}
                <span className="timeline__note">
                  {' '}
                  · {contact.projectCode} · {PROJECT_MEMBER_ROLE_LABELS[contact.projectRole]}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void onStart(() =>
                    open.mutateAsync({
                      kind: CONVERSATION_KIND.DIRECT,
                      projectId: contact.projectId,
                      withUserId: contact.id,
                    }),
                  )
                }
              >
                {contact.conversationId ? 'Open' : 'Message'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
