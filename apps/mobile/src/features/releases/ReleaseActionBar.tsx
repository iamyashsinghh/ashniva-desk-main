import { PERMISSIONS, type ReleaseDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { PublishReleaseSheet } from './PublishReleaseSheet';
import { releaseButtons, type ReleaseAction } from './release-actions';
import { useReleaseAction } from './release-api';
import { ApprovalDecisionSheet, ScheduleReleaseSheet } from './ReleaseDecisionSheets';
import { ReleaseReasonSheet } from './ReleaseReasonSheet';

type SheetAction = Exclude<ReleaseAction, 'request-approval' | 'verify-live'>;

/**
 * The release's workflow buttons, pinned under the page.
 *
 * Request approval and Verify live ask nothing more and go straight to the API; everything else
 * opens a sheet for the note, time, version or reason it needs. A button that is off says why
 * under the bar — on a phone there is no tooltip to hide the reason in.
 */
export function ReleaseActionBar({ release }: { release: ReleaseDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const [sheet, setSheet] = useState<SheetAction | null>(null);
  const requestApproval = useReleaseAction(release.id, 'request-approval');
  const verifyLive = useReleaseAction(release.id, 'verify-live', () => ({}));

  const buttons = releaseButtons(release, {
    manage: can(PERMISSIONS.RELEASE_MANAGE),
    approve: can(PERMISSIONS.RELEASE_APPROVE),
    publish: can(PERMISSIONS.RELEASE_PUBLISH),
  });
  if (buttons.length === 0) {
    return null;
  }

  const reasons = buttons.filter((button) => !button.enabled && button.reason);
  const error = requestApproval.error ?? verifyLive.error;
  const close = () => setSheet(null);

  const press = (action: ReleaseAction) => {
    if (action === 'request-approval') {
      void requestApproval.run();
    } else if (action === 'verify-live') {
      void verifyLive.run();
    } else {
      setSheet(action);
    }
  };

  return (
    <>
      <StickyActionBar
        note={
          reasons.length > 0 || error ? (
            <View style={{ gap: theme.spacing.xs }}>
              {error ? (
                <Banner tone="danger" role="alert">
                  {error}
                </Banner>
              ) : null}
              {reasons.map((button) => (
                <AppText key={button.action} size="xs" tone="muted">
                  {button.label}: {button.reason}
                </AppText>
              ))}
            </View>
          ) : undefined
        }
      >
        {buttons.map((button) => (
          <Grow key={button.action}>
            <Button
              label={button.label}
              icon={button.icon}
              variant={button.variant}
              disabled={!button.enabled}
              loading={
                (button.action === 'request-approval' && requestApproval.busy) ||
                (button.action === 'verify-live' && verifyLive.busy)
              }
              onPress={() => press(button.action)}
            />
          </Grow>
        ))}
      </StickyActionBar>

      {sheet === 'approve' || sheet === 'reject' ? (
        <ApprovalDecisionSheet release={release} rejecting={sheet === 'reject'} onClose={close} />
      ) : null}
      {sheet === 'schedule' ? <ScheduleReleaseSheet release={release} onClose={close} /> : null}
      {sheet === 'publish' ? <PublishReleaseSheet release={release} onClose={close} /> : null}
      {sheet === 'rollback' || sheet === 'reopen' ? (
        <ReleaseReasonSheet release={release} action={sheet} onClose={close} />
      ) : null}
    </>
  );
}
