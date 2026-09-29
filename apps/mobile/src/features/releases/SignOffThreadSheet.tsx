import { UAT_DECISION, type UatCommentRow, type UatRequestDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import {
  AppText,
  Button,
  Divider,
  Field,
  Input,
  Pill,
  PillRow,
} from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { QueryState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The conversation on one sign-off request, and the provider's reply. A client who asks a question
 * before approving is waiting on this side to answer it; the reply lands in their portal.
 */
export function SignOffThreadSheet({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const query = useResource<UatRequestDetail>(
    ['uat', 'internal', 'detail', requestId],
    `/uat/${requestId}`,
  );

  return (
    <Sheet
      visible
      title="Client sign-off"
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={<Button label="Close" variant="secondary" onPress={onClose} />}
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? <Thread request={query.data} /> : null}
      </QueryState>
    </Sheet>
  );
}

function Thread({ request }: { request: UatRequestDetail }) {
  const theme = useTheme();
  const [body, setBody] = useState('');
  const reply = useApiMutation<string, UatCommentRow>({
    path: `/uat/${request.id}/comments`,
    body: (text) => ({ body: text }),
    invalidate: [['uat']],
    onSuccess: () => setBody(''),
  });
  const decided = request.status !== UAT_DECISION.PENDING;

  return (
    <>
      <AppText size="xs" tone="muted">
        {request.clientName} · asked {formatDateTime(request.createdAt)} by {request.createdByName}
      </AppText>
      <AppText>{request.summaryPlain}</AppText>
      {decided ? (
        <View style={{ gap: theme.spacing.xs }}>
          <PillRow>
            <Pill
              label={request.status === UAT_DECISION.APPROVED ? 'Signed off' : 'Changes requested'}
              tone={request.status === UAT_DECISION.APPROVED ? 'success' : 'danger'}
            />
          </PillRow>
          {request.note ? <AppText size="sm">“{request.note}”</AppText> : null}
        </View>
      ) : null}

      {request.comments.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has been said on this yet.
        </AppText>
      ) : (
        request.comments.map((comment, index) => (
          <View key={comment.id} style={{ gap: 2 }}>
            {index > 0 ? (
              <View style={{ paddingBottom: theme.spacing.sm }}>
                <Divider />
              </View>
            ) : null}
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
              <AppText size="sm" weight="medium">
                {comment.authorName}
              </AppText>
              <Pill
                label={comment.fromClient ? 'Client' : 'Us'}
                tone={comment.fromClient ? 'warning' : 'neutral'}
              />
            </View>
            <AppText size="sm">{comment.body}</AppText>
            <AppText size="xs" tone="faint">
              {formatDateTime(comment.createdAt)}
            </AppText>
          </View>
        ))
      )}

      <Field label="Reply" hint="The client reads this in their portal, where they asked.">
        <Input
          accessibilityLabel="Reply"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={body}
          onChangeText={setBody}
        />
      </Field>
      <Button
        label="Send reply"
        icon="send"
        loading={reply.busy}
        disabled={body.trim().length < 2}
        onPress={() => void reply.run(body.trim())}
      />
      {reply.error ? (
        <Banner tone="danger" role="alert">
          {reply.error}
        </Banner>
      ) : null}
    </>
  );
}
