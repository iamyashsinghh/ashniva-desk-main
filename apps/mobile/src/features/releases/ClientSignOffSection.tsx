import {
  UAT_DECISION,
  type ReleaseDetail,
  type UatDecision,
  type UatRequestSummary,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider, Pill, type PillTone } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { releaseKeys } from './release-api';
import { RequestSignOffSheet } from './RequestSignOffSheet';
import { SignOffThreadSheet } from './SignOffThreadSheet';

/** The provider's wording; the portal's own labels speak to the client as "you". */
const DECISION: Record<UatDecision, { label: string; tone: PillTone }> = {
  [UAT_DECISION.PENDING]: { label: 'Waiting on the client', tone: 'warning' },
  [UAT_DECISION.APPROVED]: { label: 'Signed off', tone: 'success' },
  [UAT_DECISION.CHANGES_REQUESTED]: { label: 'Changes requested', tone: 'danger' },
};

/**
 * The client's sign-off on this release: what has been asked, and how to ask. The client answers
 * in their portal, and their approval is what the client sign-off gate reads.
 */
export function ClientSignOffSection({
  release,
  canManage,
}: {
  release: ReleaseDetail;
  canManage: boolean;
}) {
  const theme = useTheme();
  const [asking, setAsking] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const requests = useResource<UatRequestSummary[]>(releaseKeys.signOffs(release.id), '/uat', {
    query: { releaseId: release.id },
    enabled: canManage,
  });
  const rows = requests.data ?? [];

  return (
    <Section
      title="Client sign-off"
      icon="ribbon-outline"
      {...(rows.length > 0 ? { count: rows.length } : {})}
      action={
        canManage ? (
          <Button
            label="Ask"
            icon="send-outline"
            size="sm"
            variant="ghost"
            onPress={() => setAsking(true)}
          />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <AppText size="sm" tone="muted">
          The client has not been asked. Say in plain language what they should look at; they answer
          in their portal.
        </AppText>
      ) : (
        rows.map((row, index) => (
          <View key={row.id} style={{ gap: theme.spacing.xs }}>
            {index > 0 ? <Divider /> : null}
            <View style={{ alignItems: 'flex-start' }}>
              <Pill label={DECISION[row.status].label} tone={DECISION[row.status].tone} />
            </View>
            <AppText size="sm">{row.summaryPlain}</AppText>
            {row.note ? (
              <AppText size="sm" tone="muted">
                “{row.note}”
              </AppText>
            ) : null}
            <AppText size="xs" tone="faint">
              {row.decidedAt
                ? `${row.decidedByName ?? 'The client'} · ${formatDateTime(row.decidedAt)}`
                : `Asked ${formatDateTime(row.createdAt)}`}
            </AppText>
            {canManage ? (
              <View style={{ alignItems: 'flex-start' }}>
                <Button
                  label="Open the thread"
                  icon="chatbubbles-outline"
                  size="sm"
                  variant="ghost"
                  onPress={() => setThreadId(row.id)}
                />
              </View>
            ) : null}
          </View>
        ))
      )}
      {asking ? <RequestSignOffSheet release={release} onClose={() => setAsking(false)} /> : null}
      {threadId ? (
        <SignOffThreadSheet requestId={threadId} onClose={() => setThreadId(null)} />
      ) : null}
    </Section>
  );
}
