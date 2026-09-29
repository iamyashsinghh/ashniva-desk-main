import {
  PERMISSIONS,
  SIMILARITY_DECISION,
  SIMILARITY_DECISION_LABELS,
  type SimilarTicketsResponse,
} from '@ashniva/types';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { Section } from '../../../shared/components/layout';
import {
  AppText,
  Button,
  Divider,
  Pill,
  type PillTone,
} from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';

type Decision = 'LINKED' | 'DISMISSED';

const DECISION_TONE: Record<string, PillTone> = {
  [SIMILARITY_DECISION.PENDING]: 'warning',
  [SIMILARITY_DECISION.LINKED]: 'success',
  [SIMILARITY_DECISION.DISMISSED]: 'neutral',
};

/**
 * "Is this the same fault we already have?" — the web's Similar issues panel.
 *
 * Everything here is internal: it names other clients, which is precisely why no client ever sees
 * it. `problem:read` gates the request so a reader without it is not sent one that answers 403;
 * confirming a duplicate needs `problem:manage`, and the button says so rather than vanishing.
 */
export function TicketSimilar({
  ticketId,
  onOpenTicket,
}: {
  ticketId: string;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canRead = can(PERMISSIONS.PROBLEM_READ);
  const canConfirm = can(PERMISSIONS.PROBLEM_MANAGE);
  const query = useResource<SimilarTicketsResponse>(
    ['tickets', ticketId, 'similar'],
    `/tickets/${ticketId}/similar`,
    { enabled: canRead },
  );
  const decide = useApiMutation<
    { candidateId: string; decision: Decision },
    SimilarTicketsResponse
  >({
    path: ({ candidateId }) => `/tickets/${ticketId}/similar/${candidateId}/decide`,
    body: ({ decision }) => ({ decision }),
    invalidate: [['tickets']],
  });

  const data = query.data;
  if (!canRead || !data || data.suggestions.length === 0) {
    return null;
  }

  return (
    <Section
      title="Similar issues"
      count={data.suggestions.length}
      icon="copy-outline"
      action={
        <Pill
          label={`${data.clientCount} of ${data.duplicateThreshold} clients`}
          tone={data.thresholdReached ? 'danger' : 'neutral'}
        />
      }
    >
      <MetaLine icon="eye-off-outline">
        Client identities are never shown to other clients.
      </MetaLine>
      {data.suggestions.map((suggestion, index) => (
        <View key={suggestion.ticketId} style={{ gap: theme.spacing.sm }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <IconTile name="documents-outline" tone="orange" size={32} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium" numberOfLines={2}>
                {suggestion.key} · {suggestion.title}
              </AppText>
              <AppText size="xs" tone="muted" numberOfLines={2}>
                {suggestion.clientOrganizationName}
                {suggestion.productVersion ? ` · ${suggestion.productVersion}` : ''}
                {suggestion.signals.length > 0 ? ` · ${suggestion.signals.join(' · ')}` : ''}
              </AppText>
            </View>
            <Pill
              label={SIMILARITY_DECISION_LABELS[suggestion.decision]}
              tone={DECISION_TONE[suggestion.decision] ?? 'neutral'}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {onOpenTicket ? (
              <Button
                label="Open"
                size="sm"
                variant="ghost"
                icon="open-outline"
                onPress={() => onOpenTicket(suggestion.ticketId)}
              />
            ) : null}
            {suggestion.decision === SIMILARITY_DECISION.PENDING ? (
              <>
                <Button
                  label="Confirm duplicate"
                  size="sm"
                  loading={decide.busy}
                  disabled={!canConfirm}
                  accessibilityHint={
                    canConfirm
                      ? 'Links both tickets into one problem'
                      : 'Needs the problem:manage permission'
                  }
                  onPress={() =>
                    void decide.run({ candidateId: suggestion.ticketId, decision: 'LINKED' })
                  }
                />
                <Button
                  label="Not the same"
                  size="sm"
                  variant="secondary"
                  loading={decide.busy}
                  onPress={() =>
                    void decide.run({ candidateId: suggestion.ticketId, decision: 'DISMISSED' })
                  }
                />
              </>
            ) : null}
          </View>
        </View>
      ))}
      {decide.error ? (
        <Banner tone="danger" role="alert">
          {decide.error}
        </Banner>
      ) : null}
    </Section>
  );
}
