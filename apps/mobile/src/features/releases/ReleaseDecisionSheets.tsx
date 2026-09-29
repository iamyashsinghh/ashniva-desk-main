import {
  RELEASE_APPROVAL_DECISION,
  type ReleaseApproverRole,
  type ReleaseDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '../../shared/components/chips';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useReleaseAction } from './release-api';
import { APPROVER_ROLE_LABELS } from './release-display';
import { SheetButtons } from './SheetButtons';

interface DecisionBody {
  decision: typeof RELEASE_APPROVAL_DECISION.APPROVED | typeof RELEASE_APPROVAL_DECISION.REJECTED;
  note?: string;
  approverRole?: ReleaseApproverRole;
}

/**
 * One required sign-off, recorded or withheld.
 *
 * A rejection must carry a reason — the API refuses it without one. The role choice only appears
 * when the release waits on more than one sign-off: it is for the person who wears two hats on a
 * small team, and is shown inline because a picker over this sheet is not reliably shown on iOS.
 */
export function ApprovalDecisionSheet({
  release,
  rejecting,
  onClose,
}: {
  release: ReleaseDetail;
  rejecting: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [role, setRole] = useState<ReleaseApproverRole | null>(null);
  const decide = useReleaseAction<DecisionBody>(release.id, 'approve', (body) => body, onClose);
  const waiting = release.approvals.filter(
    (row) => row.decision === RELEASE_APPROVAL_DECISION.PENDING,
  );
  const trimmed = note.trim();

  const send = () =>
    void decide.run({
      decision: rejecting ? RELEASE_APPROVAL_DECISION.REJECTED : RELEASE_APPROVAL_DECISION.APPROVED,
      ...(trimmed ? { note: trimmed } : {}),
      ...(role ? { approverRole: role } : {}),
    });

  return (
    <Sheet
      visible
      title={rejecting ? 'Reject this release' : 'Approve this release'}
      subtitle={`${release.version} — ${release.title}`}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={rejecting ? 'Reject' : 'Approve'}
          confirmIcon={rejecting ? 'close' : 'checkmark'}
          danger={rejecting}
          busy={decide.busy}
          disabled={rejecting && !trimmed}
          onCancel={onClose}
          onConfirm={send}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {rejecting
          ? 'The release goes back to draft and the sign-offs collected so far are discarded.'
          : `You are signing off ${release.version} — ${release.title}.`}
      </AppText>
      {waiting.length > 1 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="sm" weight="medium">
            Which sign-off is this?
          </AppText>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Which sign-off is this?"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
          >
            <Chip
              label="The one my role implies"
              role="radio"
              selected={role === null}
              onPress={() => setRole(null)}
            />
            {waiting.map((row) => (
              <Chip
                key={row.id}
                label={APPROVER_ROLE_LABELS[row.approverRole]}
                role="radio"
                selected={role === row.approverRole}
                onPress={() => setRole(row.approverRole)}
              />
            ))}
          </View>
          <AppText size="xs" tone="faint">
            Leave it as it is unless you hold more than one of these roles.
          </AppText>
        </View>
      ) : null}
      <Field
        label={rejecting ? 'Why' : 'Note'}
        required={rejecting}
        hint="Everyone on this release reads it."
      >
        <Input
          accessibilityLabel={rejecting ? 'Why' : 'Note'}
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={note}
          onChangeText={setNote}
        />
      </Field>
      {decide.error ? (
        <Banner tone="danger" role="alert">
          {decide.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}

/**
 * Plan when the release goes out. A reminder, not a timer: nothing publishes on its own, and every
 * gate is re-checked when somebody presses Publish.
 */
export function ScheduleReleaseSheet({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [at, setAt] = useState<string | null>(release.scheduledFor);
  const [note, setNote] = useState('');
  const [past, setPast] = useState(false);
  const [openedAt] = useState(() => new Date());
  const schedule = useReleaseAction<{ at: string; note?: string }>(
    release.id,
    'schedule',
    (body) => body,
    onClose,
  );

  // The clock is read when the operator commits, not while rendering.
  const send = () => {
    if (!at) {
      return;
    }
    if (new Date(at).getTime() <= Date.now()) {
      setPast(true);
      return;
    }
    const trimmed = note.trim();
    void schedule.run({ at, ...(trimmed ? { note: trimmed } : {}) });
  };

  return (
    <Sheet
      visible
      title={release.scheduledFor ? 'Move the release window' : 'Plan when this goes out'}
      subtitle={release.version}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel="Schedule"
          confirmIcon="calendar-outline"
          busy={schedule.busy}
          disabled={!at}
          onCancel={onClose}
          onConfirm={send}
        />
      }
    >
      <AppText size="sm" tone="muted">
        This is a reminder, not a timer: nothing publishes the release when the moment comes.
      </AppText>
      <DateTimeField
        label="When it should go out"
        mode="datetime"
        required
        allowClear={false}
        minimumDate={openedAt}
        value={at}
        onChange={(value) => {
          setAt(value);
          setPast(false);
        }}
        {...(past ? { error: 'Schedule a release for a time that has not passed yet' } : {})}
      />
      <Field label="Note" hint="Recorded on the release history.">
        <Input
          accessibilityLabel="Note"
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
          value={note}
          onChangeText={setNote}
        />
      </Field>
      {schedule.error ? (
        <Banner tone="danger" role="alert">
          {schedule.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
