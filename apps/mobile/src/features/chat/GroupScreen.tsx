import {
  CONVERSATION_MEMBER_ROLE,
  CONVERSATION_MEMBER_ROLE_LABELS,
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_GROUP_MEMBERS,
  type ConversationDetail,
  type ConversationParticipant,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useGroupWrites, useMessagingDirectory } from './scope-api';

/**
 * A group: what it is called, who is in it, and the way out.
 *
 * Its own screen rather than a panel inside the thread, because a phone has one column and a
 * member list wedged above the conversation is in the way of the thing people came for.
 *
 * Every control is `abilities.canManage` or `abilities.canLeave` — computed on the server, sent
 * with the conversation. The API refuses each of these writes on its own account for somebody who
 * does not administer the group, and re-checks every addition against the adder's live scope:
 * being in a group is not a licence to bring in anybody at all. What this screen decides is only
 * whether somebody is invited into a request that would be refused.
 *
 * The picture is not here. Setting one is a rare act and the web has it; putting an image picker
 * on this screen would be the only thing on it that needs one.
 */
export function GroupScreen({
  conversationId,
  onLeft,
}: {
  conversationId: string;
  /** Called once the viewer has taken themselves out, so the stack can go back. */
  onLeft: () => void;
}) {
  const theme = useTheme();
  const detail = useResource<ConversationDetail>(
    ['conversations', conversationId],
    `/conversations/${conversationId}`,
  );
  const conversation = detail.data ?? null;
  const writes = useGroupWrites(conversationId);

  if (!conversation && detail.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(detail.error)}
          offline={detail.error instanceof Error && detail.error.name === 'NetworkError'}
          onRetry={() => void detail.refetch()}
        />
      </Screen>
    );
  }
  if (!conversation) {
    return (
      <Screen>
        <LoadingState label="Loading the group" />
      </Screen>
    );
  }

  const present = conversation.participants.filter((person) => person.leftAt === null);
  const gone = conversation.participants.filter((person) => person.leftAt !== null);
  const canManage = conversation.abilities.canManage;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <AppText size="lg" weight="bold">
            {conversation.title}
          </AppText>
          <AppText size="xs" tone="faint">
            {present.length} members
          </AppText>
          {canManage ? <RenameField conversation={conversation} /> : null}
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Members
          </AppText>
          {present.map((person) => (
            <MemberRow
              key={person.id}
              person={person}
              canRemove={canManage && person.memberRole !== CONVERSATION_MEMBER_ROLE.OWNER}
              busy={writes.removeMember.busy}
              onRemove={() => void writes.removeMember.run({ userId: person.id })}
            />
          ))}
          {gone.map((person) => (
            <AppText key={person.id} size="sm" tone="faint">
              {person.name} · left
            </AppText>
          ))}
          {writes.removeMember.error ? (
            <AppText tone="danger" size="sm">
              {writes.removeMember.error}
            </AppText>
          ) : null}
        </Card>

        {canManage && present.length < MAX_GROUP_MEMBERS ? (
          <AddMember conversationId={conversationId} inGroup={present.map((p) => p.id)} />
        ) : null}

        {conversation.abilities.canLeave ? (
          <Card>
            <Button
              label="Leave this group"
              variant="danger"
              loading={writes.leave.busy}
              accessibilityHint="You stop reading it from the next refresh; what you wrote stays"
              onPress={() =>
                void writes.leave.run().then((result) => {
                  if (result !== null) {
                    onLeft();
                  }
                })
              }
            />
            {writes.leave.error ? (
              <AppText tone="danger" size="sm">
                {writes.leave.error}
              </AppText>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** Renaming, through the one route that changes what a group *is* rather than who is in it. */
function RenameField({ conversation }: { conversation: ConversationDetail }) {
  const [title, setTitle] = useState(conversation.title);
  const writes = useGroupWrites(conversation.id);
  const trimmed = title.trim();

  return (
    <Field label="Name">
      <Input
        accessibilityLabel="Group name"
        value={title}
        maxLength={MAX_CONVERSATION_TITLE_LENGTH}
        onChangeText={setTitle}
      />
      <Button
        label="Rename"
        loading={writes.rename.busy}
        disabled={trimmed.length === 0 || trimmed === conversation.title}
        onPress={() => void writes.rename.run({ title: trimmed })}
      />
      {writes.rename.error ? (
        <AppText tone="danger" size="sm">
          {writes.rename.error}
        </AppText>
      ) : null}
    </Field>
  );
}

/**
 * Adding somebody, from the directory the API accepts names from.
 *
 * The same resolution `POST /conversations/:id/members` enforces, so a name shown is a name that
 * endpoint takes — and the check is re-run there on every addition regardless of what this sends.
 */
function AddMember({ conversationId, inGroup }: { conversationId: string; inGroup: string[] }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const directory = useMessagingDirectory(search);
  const writes = useGroupWrites(conversationId);

  const candidates = (directory.data ?? []).filter((contact) => !inGroup.includes(contact.id));

  return (
    <Card>
      <Field label="Add somebody">
        <Input
          accessibilityLabel="Find somebody to add"
          placeholder="Find somebody"
          value={search}
          onChangeText={setSearch}
        />
      </Field>
      <View style={{ gap: theme.spacing.xs }}>
        {candidates.slice(0, 8).map((contact) => (
          <View key={contact.id} style={{ gap: 2 }}>
            <AppText size="xs" tone="faint">
              {contact.reason}
            </AppText>
            <Button
              label={`Add ${contact.name}`}
              variant="secondary"
              loading={writes.addMember.busy}
              onPress={() =>
                void writes.addMember.run({ userId: contact.id }).then(() => setSearch(''))
              }
            />
          </View>
        ))}
      </View>
      {writes.addMember.error ? (
        <AppText tone="danger" size="sm">
          {writes.addMember.error}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * One member.
 *
 * The owner has no Remove button: the API refuses removing the person who made the group, and
 * offering a control that always answers 403 is worse than not offering one.
 */
function MemberRow({
  person,
  canRemove,
  busy,
  onRemove,
}: {
  person: ConversationParticipant;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <View style={{ gap: 2 }}>
      <AppText weight="medium">{person.name}</AppText>
      <AppText size="xs" tone="faint">
        {CONVERSATION_MEMBER_ROLE_LABELS[person.memberRole]}
      </AppText>
      {canRemove ? (
        <Button
          label={`Remove ${person.name}`}
          variant="secondary"
          loading={busy}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}
