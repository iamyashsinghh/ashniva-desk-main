import type { ConversationCallSummary, ConversationSummary } from '@ashniva/types';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { callStatusLabel } from './ConversationCalls';
import { isInboxKind } from './conversation-filters';
import { useOversightCalls, useOversightConversations } from './oversight-api';

/**
 * The administrator view: conversations and calls the reader is not part of.
 *
 * A plainer list than the member's own, as on the web: there is no unread state for a thread the
 * reader was never in, and no search, because a search over other people's conversations invites
 * browsing rather than looking something up. Mounted only once the view is switched on, so the
 * audited requests never fire for somebody who did not ask to inspect.
 */
export function OversightInbox({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const theme = useTheme();
  const threads = useOversightConversations(true);
  const calls = useOversightCalls(true);
  const [pulling, setPulling] = useState(false);

  const rows = (threads.data ?? []).filter((row) => isInboxKind(row.kind));

  const pull = () => {
    setPulling(true);
    void Promise.all([threads.refetch(), calls.refetch()]).finally(() => setPulling(false));
  };

  return (
    <ScrollView
      contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={theme.colors.primary} />
      }
    >
      <Banner tone="warning">
        You are looking at conversations you are not part of. Every one of these views is recorded
        in the audit log.
      </Banner>

      <SectionHeader title="Conversations" icon="chatbubbles-outline" />
      {threads.isLoading ? <LoadingState label="Loading conversations" /> : null}
      {threads.error ? (
        <ErrorState message={errorMessage(threads.error)} onRetry={() => void threads.refetch()} />
      ) : null}
      {!threads.isLoading && !threads.error && rows.length === 0 ? (
        <EmptyState title="No conversations" description="Nothing matches this filter." />
      ) : null}
      <View>
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <Divider /> : null}
            <OversightThreadRow row={row} onOpen={onOpen} />
          </View>
        ))}
      </View>

      <SectionHeader title="Internal calls" icon="call-outline" />
      {calls.isLoading ? <LoadingState label="Loading calls" /> : null}
      {calls.error ? (
        <ErrorState message={errorMessage(calls.error)} onRetry={() => void calls.refetch()} />
      ) : null}
      {!calls.isLoading && !calls.error && (calls.data ?? []).length === 0 ? (
        <EmptyState
          title="No internal calls"
          description="Calls placed from a conversation appear here."
          icon="call-outline"
          iconTone="neutral"
        />
      ) : null}
      <View style={{ gap: theme.spacing.sm }}>
        {(calls.data ?? []).map((call) => (
          <OversightCallRow key={call.id} call={call} />
        ))}
      </View>
    </ScrollView>
  );
}

function OversightThreadRow({
  row,
  onOpen,
}: {
  row: ConversationSummary;
  onOpen: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const when = formatDateTime(row.lastMessageAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={when ? `${row.title}, last message ${when}` : row.title}
      accessibilityHint="Opens the conversation as an administrator"
      onPress={() => onOpen(row.id)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        gap: 2,
        justifyContent: 'center',
        minHeight: TOUCH_TARGET,
        paddingVertical: theme.spacing.sm,
      })}
    >
      <AppText weight="medium" tone="primary" numberOfLines={1}>
        {row.title}
      </AppText>
      {when ? (
        <AppText size="xs" tone="faint">
          {when}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function OversightCallRow({ call }: { call: ConversationCallSummary }) {
  const who = call.initiatedBy?.name ?? 'Somebody';
  const to = call.participants.map((person) => person.name).join(', ');
  const details = [
    formatDateTime(call.startedAt),
    call.durationSeconds ? `${Math.round(call.durationSeconds / 60)} min` : null,
    call.hasRecording ? 'recorded' : null,
  ].filter(Boolean);
  return (
    <View accessible style={{ gap: 2 }}>
      <AppText size="sm" weight="medium">
        {callStatusLabel(call.status)}
        <AppText size="sm" tone="muted">
          {` · ${who}${to ? ` → ${to}` : ''}`}
        </AppText>
      </AppText>
      <AppText size="xs" tone="faint">
        {details.join(' · ')}
      </AppText>
    </View>
  );
}
