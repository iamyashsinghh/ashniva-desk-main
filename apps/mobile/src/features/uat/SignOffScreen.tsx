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
import { AppText, Button, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
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
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Card>
            <AppText size="xs" tone="faint">
              Asked {formatSince(request.createdAt)}
              {request.releaseVersion ? ` · version ${request.releaseVersion}` : ''}
            </AppText>
            <AppText size="lg" weight="bold">
              What changed
            </AppText>
            <AppText>{request.summaryPlain}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Pill label={uatStatusLabel(request.status)} tone={uatStatusTone(request.status)} />
            </View>
          </Card>

          {request.checklist.length > 0 ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                What to check ({request.checklist.length})
              </AppText>
              {request.checklist.map((item, index) => (
                <AppText key={item} size="sm">
                  {index + 1}. {item}
                </AppText>
              ))}
            </Card>
          ) : null}

          {request.previewUrl ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Try it yourself
              </AppText>
              <Button
                label="Open the preview"
                variant="secondary"
                accessibilityHint="Opens the link your team sent, in your browser"
                onPress={() => void open(request.previewUrl ?? '')}
              />
              {openError ? (
                <AppText tone="danger" size="sm">
                  {openError}
                </AppText>
              ) : null}
            </Card>
          ) : null}

          {isAwaitingDecision(request.status) ? (
            <SignOffDecisionForm requestId={request.id} onDecided={refresh} />
          ) : (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Your answer
              </AppText>
              <AppText size="sm">
                {uatStatusLabel(request.status)}
                {request.decidedByName ? ` · ${request.decidedByName}` : ''}
                {request.decidedAt ? ` · ${formatDateTime(request.decidedAt)}` : ''}
              </AppText>
              {request.note ? <AppText>{request.note}</AppText> : null}
            </Card>
          )}

          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Questions ({request.comments.length})
            </AppText>
            {request.comments.length === 0 ? (
              <AppText tone="muted">Nothing asked yet.</AppText>
            ) : (
              request.comments.map((comment) => (
                <View key={comment.id} style={{ gap: theme.spacing.xs }}>
                  <Divider />
                  <AppText size="xs" tone="faint">
                    {comment.authorName}
                    {comment.fromClient ? ' · your organization' : ''} ·{' '}
                    {formatSince(comment.createdAt)}
                  </AppText>
                  <AppText size="sm">{comment.body}</AppText>
                </View>
              ))
            )}
          </Card>

          <SignOffQuestionForm requestId={request.id} onAsked={refresh} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
