import {
  HOUR_LEDGER_KIND,
  HOUR_LEDGER_KIND_LABELS,
  type ContractHourBalance,
} from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { ChipGroup } from '../../shared/components/chips';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { ErrorNote, SheetActions } from './commercial-ui';
import {
  CONTRACT_INVALIDATES,
  MANUAL_HOUR_KINDS,
  hoursToMinutes,
  type ManualHourKind,
} from './contract-display';
import { reauthHeaders } from './reauth';

/**
 * Recording purchased, reserved, released or adjusted hours — always with a reason and the
 * person's password, because the balance is what the client is billed against.
 *
 * The idempotency key is fixed when the sheet opens, so a second tap on a slow connection, or a
 * retry after the answer was lost, records the movement once rather than twice.
 */
export function AdjustHoursSheet({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const [kind, setKind] = useState<ManualHourKind>(HOUR_LEDGER_KIND.PURCHASED);
  const [hours, setHours] = useState('5');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = hoursToMinutes(hours);
  const negativeAllowed = kind === HOUR_LEDGER_KIND.ADJUSTMENT;
  let hoursProblem: string | null = null;
  if (minutes === null || minutes === 0) {
    hoursProblem = 'Enter a number of hours other than zero.';
  } else if (minutes < 0 && !negativeAllowed) {
    hoursProblem = 'Only an adjustment can remove hours.';
  } else if (Math.abs(minutes) > 600_000) {
    hoursProblem = 'That is more hours than one movement can record.';
  }
  const valid = !hoursProblem && reason.trim().length >= 3 && password.length > 0;

  const submit = async () => {
    if (!valid || minutes === null) {
      return;
    }
    if (password.includes('@')) {
      setError('That looks like an email address. Type the password you sign in with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await reauthHeaders(password);
      await apiRequest<ContractHourBalance>(`/contracts/${contractId}/hours`, {
        method: 'POST',
        headers,
        body: {
          kind,
          minutes,
          reason: reason.trim(),
          idempotencyKey: `mobile:${openedAt}:${kind}:${minutes}`,
        },
      });
      await Promise.all(
        CONTRACT_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title="Adjust support hours"
      subtitle="Recorded in the ledger and the audit log."
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Record"
          confirmIcon="checkmark"
          busy={busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void submit()}
        />
      }
    >
      <ChipGroup
        label="Movement"
        options={MANUAL_HOUR_KINDS}
        selected={kind}
        onSelect={setKind}
        labelFor={(value) => HOUR_LEDGER_KIND_LABELS[value]}
      />
      <Field
        label="Hours"
        required
        {...(negativeAllowed ? { hint: 'A negative number removes hours.' } : {})}
        {...(hours.trim() && hoursProblem ? { error: hoursProblem } : {})}
      >
        <Input
          accessibilityLabel="Hours"
          keyboardType="numbers-and-punctuation"
          value={hours}
          onChangeText={setHours}
        />
      </Field>
      <Field label="Reason" required hint="At least three characters. The client never sees this.">
        <Input
          accessibilityLabel="Reason"
          multiline
          numberOfLines={3}
          maxLength={500}
          style={{ minHeight: 80 }}
          value={reason}
          onChangeText={setReason}
        />
      </Field>
      <Field label="Your sign-in password" required hint="Moving hours asks for it every time.">
        <Input
          accessibilityLabel="Your sign-in password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="off"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
      </Field>
      <AppText size="xs" tone="muted">
        Purchased adds hours to this period; reserved sets hours aside; released returns them.
      </AppText>
      <ErrorNote message={error} />
    </Sheet>
  );
}
