import {
  CHANGE_REQUEST_STATUS_LABELS,
  type ChangeRequestHistoryEntry,
  type PortalChangeRequestDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import {
  KeyValueRow,
  ListRow,
  MetaLine,
  StatTile,
  TileGrid,
} from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDate, formatDateTime, formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { TicketMessages, TicketReplyComposer } from '../../tickets/TicketConversation';
import { formatCost, formatDays } from '../portal-display';
import { portalKeys } from '../portal-keys';

type Cr = PortalChangeRequestDetail;

function Paragraph({ label, text }: { label: string; text: string | null }) {
  const theme = useTheme();
  if (!text) {
    return null;
  }
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText size="xs" tone="muted" weight="medium">
        {label}
      </AppText>
      <AppText size="sm">{text}</AppText>
    </View>
  );
}

/** What was asked for, and why — plus the decision note once someone has decided. */
export function RequestOverview({ cr }: { cr: Cr }) {
  return (
    <Section title="The request" icon="document-text-outline">
      <Paragraph label="What should change" text={cr.description} />
      <Paragraph label="Business reason" text={cr.businessReason} />
      <Paragraph label="Scope" text={cr.scope} />
      <Paragraph label="Impact" text={cr.impact} />
      <Paragraph label="Decision note" text={cr.decisionNote} />
    </Section>
  );
}

/** The provider's estimate: effort, cost and what it does to the timeline. */
export function RequestImpact({ cr }: { cr: Cr }) {
  const estimated =
    cr.estimatedMinutes !== null || cr.costImpact !== null || cr.timelineImpactDays !== null;
  return (
    <Section title="Estimate and impact" icon="calculator-outline">
      {estimated ? (
        <TileGrid>
          <StatTile
            label="Effort"
            value={cr.estimatedMinutes !== null ? formatMinutes(cr.estimatedMinutes) : '—'}
          />
          <StatTile label="Cost" value={formatCost(cr.costImpact, cr.currency)} />
          <StatTile
            label="Timeline"
            value={cr.timelineImpactDays !== null ? `+${formatDays(cr.timelineImpactDays)}` : '—'}
          />
          <StatTile label="Scheduled" value={formatDate(cr.scheduledFor) ?? '—'} />
        </TileGrid>
      ) : (
        <AppText size="sm" tone="muted">
          Not estimated yet. The provider adds effort, cost and timeline once they have reviewed the
          request.
        </AppText>
      )}
    </Section>
  );
}

/**
 * The conversation with the provider. A client's comment is always client-visible — the API
 * defaults it so, and internal notes never reach the portal DTO.
 */
export function RequestDiscussion({ cr }: { cr: Cr }) {
  const [body, setBody] = useState('');
  const reply = useApiMutation<string, unknown>({
    path: `/portal/change-requests/${cr.id}/comments`,
    body: (text) => ({ body: text }),
    invalidate: [portalKeys.changeRequest(cr.id)],
    onSuccess: () => setBody(''),
  });

  return (
    <Section title="Discussion" icon="chatbubbles-outline" count={cr.comments.length}>
      <TicketMessages comments={cr.comments} emptyText="No messages yet." />
      {cr.canReply ? (
        <TicketReplyComposer
          value={body}
          onChange={setBody}
          busy={reply.busy}
          error={reply.error}
          onSend={() => {
            const text = body.trim();
            if (text) {
              void reply.run(text);
            }
          }}
          audienceHint="The provider reads this."
        />
      ) : (
        <MetaLine icon="lock-closed-outline">This request is closed.</MetaLine>
      )}
    </Section>
  );
}

function historyLine(entry: ChangeRequestHistoryEntry): string {
  return `${CHANGE_REQUEST_STATUS_LABELS[entry.toStatus]} · ${entry.changedBy.name}`;
}

export function RequestHistory({ history }: { history: readonly ChangeRequestHistoryEntry[] }) {
  return (
    <Section
      title="History"
      icon="time-outline"
      count={history.length}
      collapsible
      initiallyOpen={false}
    >
      {history.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has happened yet.
        </AppText>
      ) : (
        history.map((entry) => (
          <View key={entry.id}>
            <AppText size="sm" weight="medium">
              {historyLine(entry)}
            </AppText>
            {entry.note ? <AppText size="sm">{entry.note}</AppText> : null}
            <MetaLine icon="calendar-outline">{formatDateTime(entry.createdAt) ?? '—'}</MetaLine>
          </View>
        ))
      )}
    </Section>
  );
}

export function RequestDetails({
  cr,
  onOpenProject,
}: {
  cr: Cr;
  onOpenProject?: (projectId: string) => void;
}) {
  const project = cr.project;
  return (
    <Section title="Details" icon="list-outline">
      <KeyValueRow label="Number" value={cr.number} />
      <KeyValueRow label="Requested by" value={cr.requestedBy.name} />
      <KeyValueRow label="Submitted" value={formatDateTime(cr.submittedAt) ?? 'Not yet'} />
      <KeyValueRow label="Raised" value={formatDateTime(cr.createdAt) ?? '—'} />
      {project ? (
        <ListRow
          title={project.name}
          subtitle="Project"
          icon="folder-open-outline"
          {...(onOpenProject
            ? { onPress: () => onOpenProject(project.id), accessibilityHint: 'Opens the project' }
            : {})}
        />
      ) : null}
    </Section>
  );
}
