import {
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_GROUP_MEMBERS,
  type MessagingScopeContact,
} from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
import { EmptyState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useCreateGroup, useMessagingDirectory, useOpenDirectMessage } from './scope-api';

/**
 * Starting a direct message or a group.
 *
 * The list is the *messaging directory*, not the organization's roster: who somebody may reach
 * outside a project comes from a management relationship, and the same resolution that answers
 * this answers the create endpoints. So every name here is one the API will accept, and a
 * developer — who holds none of those relations — is told that plainly rather than shown an empty
 * box that looks broken.
 *
 * The reason travels with each name. A directory that says "you may message this person" without
 * saying what makes that true invites the question every time somebody appears or disappears from
 * it, and on a phone there is nowhere to go and look it up.
 */
export function NewConversationScreen({ onOpened }: { onOpened: (id: string) => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [chosen, setChosen] = useState<MessagingScopeContact[]>([]);

  const directory = useMessagingDirectory(search);
  const openDirect = useOpenDirectMessage();
  const createGroup = useCreateGroup();

  const contacts = directory.data ?? [];
  const named = groupTitle.trim();
  // One less than the maximum: the person creating it is in it too.
  const room = chosen.length < MAX_GROUP_MEMBERS - 1;
  const failure = openDirect.error ?? createGroup.error;

  async function start(work: () => Promise<{ id: string } | null>) {
    const conversation = await work();
    if (conversation) {
      onOpened(conversation.id);
    }
  }

  return (
    <Screen>
      <FlatList
        data={contacts}
        keyExtractor={(contact) => contact.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm }}>
            <GroupDraft
              title={groupTitle}
              chosen={chosen}
              busy={createGroup.busy}
              onTitle={setGroupTitle}
              onRemove={(id) => setChosen((current) => current.filter((entry) => entry.id !== id))}
              onCreate={() =>
                void start(() =>
                  createGroup.run({ title: named, memberIds: chosen.map((entry) => entry.id) }),
                )
              }
            />
            <Input
              accessibilityLabel="Find somebody"
              placeholder="Find somebody"
              value={search}
              onChangeText={setSearch}
            />
            {failure ? (
              <AppText tone="danger" size="sm">
                {failure}
              </AppText>
            ) : null}
            {directory.isLoading ? <LoadingState label="Loading the directory" /> : null}
            {directory.error && contacts.length === 0 ? (
              <AppText tone="danger" size="sm">
                {errorMessage(directory.error)}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          directory.isLoading ? null : (
            <EmptyState
              title="Nobody else here"
              description="There are no other people in your organization to message yet."
            />
          )
        }
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            chosen={chosen.some((entry) => entry.id === item.id)}
            canAdd={room}
            busy={openDirect.busy}
            onMessage={() => void start(() => openDirect.run({ userId: item.id }))}
            onAdd={() => setChosen((current) => [...current, item])}
          />
        )}
      />
    </Screen>
  );
}

/**
 * The group being assembled, above the directory it is assembled from.
 *
 * Hidden until somebody has picked their first person: an empty group form at the top of a screen
 * whose ordinary use is "message one person" is in the way of the ordinary use.
 */
function GroupDraft({
  title,
  chosen,
  busy,
  onTitle,
  onRemove,
  onCreate,
}: {
  title: string;
  chosen: MessagingScopeContact[];
  busy: boolean;
  onTitle: (value: string) => void;
  onRemove: (userId: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  if (chosen.length === 0) {
    return null;
  }
  return (
    <Card>
      <Field label="New group" hint={`${chosen.length} chosen. At most ${MAX_GROUP_MEMBERS}.`}>
        <Input
          accessibilityLabel="Group name"
          placeholder="What is this group for?"
          value={title}
          maxLength={MAX_CONVERSATION_TITLE_LENGTH}
          onChangeText={onTitle}
        />
      </Field>
      <View style={{ gap: theme.spacing.xs }}>
        {chosen.map((contact) => (
          <Button
            key={contact.id}
            label={`Remove ${contact.name}`}
            variant="secondary"
            onPress={() => onRemove(contact.id)}
          />
        ))}
      </View>
      <Button
        label="Create the group"
        loading={busy}
        disabled={title.trim().length === 0}
        accessibilityHint="Everybody named is checked against your reach by the API"
        onPress={onCreate}
      />
    </Card>
  );
}

function ContactRow({
  contact,
  chosen,
  canAdd,
  busy,
  onMessage,
  onAdd,
}: {
  contact: MessagingScopeContact;
  chosen: boolean;
  canAdd: boolean;
  busy: boolean;
  onMessage: () => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <AppText weight="medium">{contact.name}</AppText>
      <AppText size="xs" tone="faint">
        {contact.reason}
      </AppText>
      <Button
        label={
          contact.conversationId
            ? `Open the thread with ${contact.name}`
            : `Message ${contact.name}`
        }
        loading={busy}
        onPress={onMessage}
      />
      {chosen ? (
        <AppText size="xs" tone="muted">
          In the group you are building.
        </AppText>
      ) : (
        <Button
          label={`Add ${contact.name} to a group`}
          variant="secondary"
          disabled={!canAdd}
          onPress={onAdd}
        />
      )}
    </Card>
  );
}
