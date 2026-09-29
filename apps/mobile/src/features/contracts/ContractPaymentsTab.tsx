import {
  CONTRACT_STATUS,
  PERMISSIONS,
  type ContractDetail,
  type PaymentMilestoneSummary,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { MetaLine } from '../../shared/components/data-display';
import { Grow, Section } from '../../shared/components/layout';
import { AppText, Button, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ErrorNote, SheetActions } from './commercial-ui';
import {
  CONTRACT_INVALIDATES,
  formatMoney,
  paymentStatusLabel,
  paymentStatusTone,
} from './contract-display';
import { PaymentSheet } from './PaymentSheet';

/**
 * The payment schedule: pending → invoiced → paid, optionally tied to a delivery milestone.
 *
 * Amounts are shown when the contract's value is visible to this person or they may read costs —
 * the web's rule. Adding, editing and removing need `contract:manage` on a contract that is not
 * archived; removal asks first, since the row carries an invoice reference somebody may need.
 */
export function ContractPaymentsTab({ contract }: { contract: ContractDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const canManage =
    can(PERMISSIONS.CONTRACT_MANAGE) && contract.status !== CONTRACT_STATUS.ARCHIVED;
  const showAmounts = contract.contractValue !== null || can(PERMISSIONS.COST_READ);
  const [editing, setEditing] = useState<PaymentMilestoneSummary | 'new' | null>(null);
  const [removing, setRemoving] = useState<PaymentMilestoneSummary | null>(null);

  const remove = useApiMutation<string, void>({
    path: (paymentId) => `/contracts/${contract.id}/payment-milestones/${paymentId}`,
    method: 'DELETE',
    invalidate: CONTRACT_INVALIDATES,
    onSuccess: () => setRemoving(null),
  });

  return (
    <Section
      title="Payment milestones"
      count={contract.paymentMilestones.length}
      icon="cash-outline"
    >
      {contract.paymentMilestones.length === 0 ? (
        <AppText size="sm" tone="muted">
          No payment milestones yet.
        </AppText>
      ) : null}
      {contract.paymentMilestones.map((payment, index) => (
        <View key={payment.id} style={{ gap: theme.spacing.sm }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <AppText weight="medium" style={{ flex: 1 }}>
              {payment.title}
            </AppText>
            {showAmounts ? (
              <AppText weight="bold" tabular>
                {formatMoney(payment.amount, payment.currency)}
              </AppText>
            ) : null}
          </View>
          <PillRow>
            <Pill
              label={paymentStatusLabel(payment.status)}
              tone={paymentStatusTone(payment.status)}
            />
          </PillRow>
          {payment.dueDate ? (
            <MetaLine icon="calendar-outline">Due {formatDate(payment.dueDate)}</MetaLine>
          ) : null}
          {payment.milestone ? (
            <MetaLine icon="flag-outline">{payment.milestone.name}</MetaLine>
          ) : null}
          {payment.invoiceReference ? (
            <MetaLine icon="receipt-outline">Invoice {payment.invoiceReference}</MetaLine>
          ) : null}
          {canManage ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Grow>
                <Button
                  label="Edit"
                  size="sm"
                  variant="secondary"
                  icon="create-outline"
                  accessibilityHint={`Edits ${payment.title}`}
                  onPress={() => setEditing(payment)}
                />
              </Grow>
              <Grow>
                <Button
                  label="Remove"
                  size="sm"
                  variant="dangerGhost"
                  icon="trash-outline"
                  accessibilityHint={`Removes ${payment.title}`}
                  onPress={() => setRemoving(payment)}
                />
              </Grow>
            </View>
          ) : null}
        </View>
      ))}
      {canManage ? (
        <Button
          label="Add payment milestone"
          icon="add"
          variant="secondary"
          onPress={() => setEditing('new')}
        />
      ) : null}

      {editing ? (
        <PaymentSheet
          contract={contract}
          {...(editing === 'new' ? {} : { payment: editing })}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <Sheet
        visible={removing !== null}
        title="Remove this payment milestone?"
        {...(removing ? { subtitle: removing.title } : {})}
        onClose={() => setRemoving(null)}
        footer={
          <SheetActions
            confirmLabel="Remove"
            confirmIcon="trash-outline"
            danger
            busy={remove.busy}
            onCancel={() => setRemoving(null)}
            onConfirm={() => (removing ? void remove.run(removing.id) : undefined)}
          />
        }
      >
        <AppText>It disappears from the payment schedule, here and in the client portal.</AppText>
        <ErrorNote message={remove.error} />
      </Sheet>
    </Section>
  );
}
