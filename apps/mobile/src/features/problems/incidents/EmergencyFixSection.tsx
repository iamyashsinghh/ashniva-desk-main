import {
  canDecideEmergencyFix,
  canRequestEmergencyFix,
  EMERGENCY_FIX_STATUS,
  EMERGENCY_FIX_STATUS_LABELS,
  PERMISSIONS,
  type IncidentDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { TextActionSheet } from '../components/TextActionSheet';
import { useIncidentWrite } from '../problem-api';
import { EMERGENCY_FIX_TONE } from '../problem-display';

type Dialog = 'request' | 'APPROVED' | 'REJECTED' | null;

interface FixStep {
  action: 'request-emergency-fix' | 'approve-emergency-fix';
  body: object;
}

/**
 * Shipping outside the release process.
 *
 * Asking and deciding are different permissions on purpose: the person under pressure at two in
 * the morning is not the person who authorises skipping the release. Each button is drawn only
 * for somebody holding the permission its route checks, and both answers need a reason.
 */
export function EmergencyFixSection({ incident }: { incident: IncidentDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const [dialog, setDialog] = useState<Dialog>(null);
  const status = incident.emergencyFixStatus;
  const canAsk = can(PERMISSIONS.INCIDENT_MANAGE) && canRequestEmergencyFix(status);
  const canDecide =
    can(PERMISSIONS.INCIDENT_APPROVE_EMERGENCY_FIX) && canDecideEmergencyFix(status);

  const write = useIncidentWrite<FixStep>({
    path: ({ action }) => `/incidents/${incident.id}/${action}`,
    body: ({ body }) => body,
    onDone: () => setDialog(null),
  });
  const open = (next: Dialog) => {
    write.reset();
    setDialog(next);
  };

  return (
    <Section
      title="Emergency fix"
      icon="flash-outline"
      action={
        <Pill label={EMERGENCY_FIX_STATUS_LABELS[status]} tone={EMERGENCY_FIX_TONE[status]} />
      }
    >
      <AppText size="sm" tone={incident.emergencyFixReason ? 'default' : 'muted'}>
        {incident.emergencyFixReason ??
          'Skipping the scheduled release needs somebody senior to say so in writing.'}
      </AppText>
      {incident.emergencyFixRequestedBy ? (
        <AppText size="xs" tone="faint">
          Asked by {incident.emergencyFixRequestedBy.name}
        </AppText>
      ) : null}
      {incident.emergencyFixDecidedAt ? (
        <AppText size="xs" tone="faint">
          Decided by {incident.emergencyFixDecidedBy?.name ?? 'somebody'} on{' '}
          {formatDateTime(incident.emergencyFixDecidedAt)}
        </AppText>
      ) : null}
      {status === EMERGENCY_FIX_STATUS.APPROVED ? (
        <Banner tone="warning">
          Skips the scheduled release; still requires a QA smoke on production afterwards.
        </Banner>
      ) : null}
      {status === EMERGENCY_FIX_STATUS.REJECTED ? (
        <Banner tone="warning">
          A refusal is a decision. If the situation has genuinely changed, open a new incident.
        </Banner>
      ) : null}
      {canAsk || canDecide ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {canAsk ? (
            <Button
              label="Request emergency fix"
              icon="flash-outline"
              size="sm"
              variant="danger"
              onPress={() => open('request')}
            />
          ) : null}
          {canDecide ? (
            <>
              <Button label="Approve" icon="checkmark" size="sm" onPress={() => open('APPROVED')} />
              <Button
                label="Refuse"
                icon="close"
                size="sm"
                variant="dangerGhost"
                onPress={() => open('REJECTED')}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {dialog === 'request' ? (
        <TextActionSheet
          title="Request an emergency fix"
          label="Why this cannot wait for the scheduled release"
          submitLabel="Request"
          submitIcon="flash-outline"
          danger
          minLength={3}
          maxLength={2000}
          busy={write.busy}
          error={write.error}
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            void write.run({ action: 'request-emergency-fix', body: { reason } })
          }
        />
      ) : null}
      {dialog === 'APPROVED' || dialog === 'REJECTED' ? (
        <TextActionSheet
          title={dialog === 'APPROVED' ? 'Approve the emergency fix' : 'Refuse the emergency fix'}
          {...(incident.emergencyFixReason ? { subtitle: incident.emergencyFixReason } : {})}
          label={
            dialog === 'APPROVED'
              ? 'Why, in words. This skips the scheduled release and still owes a production smoke test.'
              : 'Why. The person who asked is owed the reason.'
          }
          submitLabel={dialog === 'APPROVED' ? 'Approve' : 'Refuse'}
          submitIcon={dialog === 'APPROVED' ? 'checkmark' : 'close'}
          danger={dialog === 'REJECTED'}
          minLength={3}
          maxLength={2000}
          busy={write.busy}
          error={write.error}
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            void write.run({
              action: 'approve-emergency-fix',
              body: { decision: dialog, reason },
            })
          }
        />
      ) : null}
    </Section>
  );
}
