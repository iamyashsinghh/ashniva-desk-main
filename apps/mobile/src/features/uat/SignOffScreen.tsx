import type { UatRequestDetail } from '@ashniva/types';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Expandable } from '../../shared/components/Expandable';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section, useStackKeyboardOffset } from '../../shared/components/layout';
import {
  AppText,
  Button,
  Divider,
  Pill,
  PillRow,
  Screen,
} from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime, formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { SignOffDecisionForm, SignOffQuestionForm } from './SignOffDecisionForm';
import { isAwaitingDecision, uatStatusLabel, uatStatusTone } from './uat-display';

/**
 * One sign-off: what changed, what to check, and the client's answer.
 *
 * The checklist is the point of the screen. Somebody signing off on a phone is standing in front
 * of the thing that changed, and a numbered list of what to try is what turns "it looks fine" into
 * an answer worth having.
 *
 * `previewUrl` is handed to the system browser rather than opened in the app. It is a link the
 * provider chose; rendering it in a web view inside a signed-in app would put somebody else's
 * page next to this session.
 */
export function SignOffScreen({ requestId }: { requestId: string }) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const [openError, setOpenError] = useState<string | null>(null);
  const query = useResource<UatRequestDetail>(
    ['portal', 'uat', requestId],
    `/portal/uat/${requestId}`,
  );
  const request = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!request && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }
  if (!request) {
    return (
      <Screen>
        <LoadingState label="Loading the sign-off" />
      </Screen>
    );
  }

  const open = async (url: string) => {
    setOpenError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setOpenError('That link could not be opened on this device.');
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Hero
            overline={`Asked ${formatSince(request.createdAt) ?? ''}${request.releaseVersion ? ` · version ${request.releaseVersion}` : ''}`}
            title="What changed"
          >
            <AppText>{request.summaryPlain}</AppText>
            <PillRow>
              <Pill label={uatStatusLabel(request.status)} tone={uatStatusTone(request.status)} />
            </PillRow>
          </Hero>

          {request.checklist.length > 0 ? (
            <Section title={`What to check (${request.checklist.length})`}>
              {request.checklist.map((item, index) => (
                <View key={item} style={{ gap: theme.spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  {/*
                    One text node, so the step reads as one sentence to a screen reader; the
                    number is only styled apart from the words.
                  */}
                  <AppText size="sm">
                    <AppText size="sm" tone="primary" weight="bold" tabular>
                      {`${index + 1}.`}
                    </AppText>
                    {` ${item}`}
                  </AppText>
                </View>
              ))}
            </Section>
          ) : null}

          {request.previewUrl ? (
            <Section title="Try it yourself">
              <Button
                label="Open the preview"
                accessibilityHint="Opens the link your team sent, in your browser"
                onPress={() => void open(request.previewUrl ?? '')}
              />
              {openError ? (
                <Banner tone="danger" role="alert">
                  {openError}
                </Banner>
              ) : null}
            </Section>
          ) : null}

          {isAwaitingDecision(request.status) ? (
            <SignOffDecisionForm requestId={request.id} onDecided={refresh} />
          ) : (
            <Section title="Your answer">
              <AppText size="sm">
                {uatStatusLabel(request.status)}
                {request.decidedByName ? ` · ${request.decidedByName}` : ''}
                {request.decidedAt ? ` · ${formatDateTime(request.decidedAt)}` : ''}
              </AppText>
              {request.note ? <AppText>{request.note}</AppText> : null}
            </Section>
          )}

          <Section title={`Questions (${request.comments.length})`}>
            {request.comments.length === 0 ? (
              <AppText size="sm" tone="muted">
                Nothing asked yet.
              </AppText>
            ) : (
              <Expandable items={request.comments} initial={5} noun="questions">
                {(comment, index) => (
                  <View key={comment.id} style={{ gap: 2 }}>
                    {index > 0 ? <Divider /> : null}
                    <AppText size="xs" tone="faint">
                      {comment.authorName}
                      {comment.fromClient ? ' · your organization' : ''} ·{' '}
                      {formatSince(comment.createdAt)}
                    </AppText>
                    <AppText size="sm">{comment.body}</AppText>
                  </View>
                )}
              </Expandable>
            )}
            <Divider />
            <SignOffQuestionForm requestId={request.id} onAsked={refresh} />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
