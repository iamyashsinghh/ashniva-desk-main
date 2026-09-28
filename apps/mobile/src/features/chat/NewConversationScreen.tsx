import { MAX_GROUP_MEMBERS, type MessagingScopeContact } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { Divider, Input, Screen } from '../../shared/components/primitives';
import { EmptyState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ContactRow, CONTACT_AVATAR, GroupDraft } from './NewConversationParts';
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
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={ContactSeparator}
        ListHeaderComponent={
          <View
            style={{
              gap: theme.spacing.md,
              padding: theme.spacing.screen,
              paddingBottom: theme.spacing.sm,
            }}
          >
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
              <Banner tone="danger" role="alert">
                {failure}
              </Banner>
            ) : null}
            {directory.isLoading ? (
              <View style={{ minHeight: 96 }}>
                <LoadingState label="Loading the directory" variant="spinner" />
              </View>
            ) : null}
            {directory.error && contacts.length === 0 ? (
              <Banner tone="danger">{errorMessage(directory.error)}</Banner>
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

function ContactSeparator() {
  const theme = useTheme();
  return <Divider inset={theme.spacing.screen + CONTACT_AVATAR + theme.spacing.md} />;
}
