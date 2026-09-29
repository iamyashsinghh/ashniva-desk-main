import { PERMISSIONS, type IncidentDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Input, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { useIncidentWrite } from '../problem-api';

const MIN_PUBLISH = 3;

/**
 * What clients may be told about an incident — the one client-visible thing on the screen, and
 * marked as such. Saving stores a draft that reaches nobody; publishing is a separate press the
 * server records with who, when and the exact wording. Nothing here publishes on its own.
 */
export function ClientSummarySection({ incident }: { incident: IncidentDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.INCIDENT_MANAGE);
  const [text, setText] = useState(incident.clientSummary ?? '');
  const published = incident.clientSummaryPublishedAt;

  const save = useIncidentWrite<string>({
    path: `/incidents/${incident.id}`,
    method: 'PATCH',
    body: (clientSummary) => ({ clientSummary }),
  });
  const publish = useIncidentWrite<string>({
    path: `/incidents/${incident.id}/publish-client-summary`,
    body: (clientSummary) => ({ clientSummary }),
  });
  const error = save.error ?? publish.error;
  const trimmed = text.trim();

  return (
    <Section
      title="Client summary"
      icon="megaphone-outline"
      action={<Pill label="Client-visible when published" tone="warning" />}
    >
      <AppText size="sm" tone="muted">
        {published
          ? `Published ${formatDateTime(published)}. Editing it here does not republish it.`
          : 'Saved here it reaches nobody. Publishing is what tells the clients on this project.'}
      </AppText>
      {canManage ? (
        <>
          <Input
            accessibilityLabel="What clients may be told"
            value={text}
            onChangeText={(next) => {
              save.reset();
              publish.reset();
              setText(next);
            }}
            multiline
            numberOfLines={4}
            maxLength={5000}
            style={{ minHeight: 104 }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Button
              label="Save draft"
              icon="save-outline"
              size="sm"
              variant="secondary"
              loading={save.busy}
              disabled={publish.busy}
              onPress={() => void save.run(trimmed)}
            />
            <Button
              label={published ? 'Publish the update' : 'Publish to clients'}
              icon="megaphone-outline"
              size="sm"
              variant="danger"
              loading={publish.busy}
              disabled={save.busy || trimmed.length < MIN_PUBLISH}
              onPress={() => void publish.run(trimmed)}
            />
          </View>
        </>
      ) : (
        <AppText>{incident.clientSummary ?? 'No summary has been written.'}</AppText>
      )}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Section>
  );
}
