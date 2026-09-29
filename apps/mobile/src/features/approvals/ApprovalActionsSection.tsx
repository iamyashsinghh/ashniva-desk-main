import { APPROVAL_ACTION, APPROVAL_STATUS, type ApprovalDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Grow, Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  APPROVAL_INVALIDATES,
  approvalButtons,
  isDirectTransition,
  type ApprovalButton,
  type DirectTransition,
} from './approval-display';
import { EditApprovalSheet } from './EditApprovalSheet';
import { WithdrawApprovalSheet } from './WithdrawApprovalSheet';

/**
 * What the provider can do with a request, from the API's own `actions`.
 *
 * Three of them are statements about where the request has got to and go straight to the API;
 * editing and withdrawing open a sheet first, for the wording and for an optional reason.
 */
export function ApprovalActionsSection({
  approval,
  onChanged,
}: {
  approval: ApprovalDetail;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const [sheet, setSheet] = useState<'edit' | 'withdraw' | null>(null);
  const buttons = approvalButtons(approval.actions);

  const transition = useApiMutation<{ action: DirectTransition }, ApprovalDetail>({
    path: (variables) => `/approvals/${approval.id}/${variables.action}`,
    invalidate: APPROVAL_INVALIDATES,
    onSuccess: onChanged,
  });

  const press = (button: ApprovalButton) => {
    if (isDirectTransition(button.action)) {
      void transition.run({ action: button.action });
    } else if (button.action === APPROVAL_ACTION.EDIT) {
      setSheet('edit');
    } else if (button.action === APPROVAL_ACTION.WITHDRAW) {
      setSheet('withdraw');
    }
  };

  const closeAfter = () => {
    setSheet(null);
    onChanged();
  };

  return (
    <Section title="Actions" icon="flash-outline">
      {buttons.length === 0 ? (
        <AppText size="sm" tone="muted">
          {approval.status === APPROVAL_STATUS.PUBLISHED
            ? 'Waiting for the client.'
            : 'Nothing more can be done with this request.'}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {buttons.map((button) => (
            <Grow key={button.action}>
              <View style={{ gap: theme.spacing.xs }}>
                <Button
                  label={button.label}
                  icon={button.icon}
                  variant={variantFor(button)}
                  loading={transition.busy && isDirectTransition(button.action)}
                  disabled={!button.enabled || transition.busy}
                  accessibilityHint={button.reason ?? button.hint}
                  onPress={() => press(button)}
                />
                {button.reason ? (
                  <AppText size="xs" tone="muted">
                    {button.reason}
                  </AppText>
                ) : null}
              </View>
            </Grow>
          ))}
        </View>
      )}
      {transition.error ? (
        <Banner tone="danger" role="alert">
          {transition.error}
        </Banner>
      ) : null}

      {sheet === 'edit' ? (
        <EditApprovalSheet
          approval={approval}
          onClose={() => setSheet(null)}
          onSaved={closeAfter}
        />
      ) : null}
      {sheet === 'withdraw' ? (
        <WithdrawApprovalSheet
          approvalId={approval.id}
          onClose={() => setSheet(null)}
          onDone={closeAfter}
        />
      ) : null}
    </Section>
  );
}

function variantFor(button: ApprovalButton): 'primary' | 'secondary' | 'dangerGhost' {
  if (button.action === APPROVAL_ACTION.WITHDRAW) {
    return 'dangerGhost';
  }
  return isDirectTransition(button.action) ? 'primary' : 'secondary';
}
