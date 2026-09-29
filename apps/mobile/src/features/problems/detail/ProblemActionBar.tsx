import type { ProblemDetail } from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Grow, StickyActionBar } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useSession } from '../../auth/SessionProvider';
import { TextActionSheet } from '../components/TextActionSheet';
import { useProblemWrite } from '../problem-api';
import { closeBlockedReason } from '../problem-display';
import { ProblemFormSheet } from '../ProblemFormSheet';
import { AssignFixSheet } from './AssignFixSheet';
import {
  primaryProblemAction,
  problemActions,
  type OfferedProblemAction,
  type ProblemActionKey,
} from './problem-actions';
import { RequestRcaSheet } from './RequestRcaSheet';

interface SimpleWrite {
  action: 'ask-developer' | 'preventive-test' | 'close';
  body: object;
}

/**
 * The bar at the foot of a problem: the next step as a button, everything else under "More".
 *
 * The server's blocker sentences sit above the bar whenever Close is off, as the approved design
 * prints them under the disabled button — so the refusal that would come back and the reason on
 * screen cannot drift apart.
 */
export function ProblemActionBar({ problem }: { problem: ProblemDetail }) {
  const { can } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<ProblemActionKey | null>(null);
  const close = () => setDialog(null);

  const write = useProblemWrite<SimpleWrite>({
    path: ({ action }) => `/problems/${problem.id}/${action}`,
    body: ({ body }) => body,
    onDone: close,
  });

  const offered = problemActions(problem, can);
  if (offered.length === 0) {
    return null;
  }
  const primary = primaryProblemAction(offered, problem);
  const blocked = closeBlockedReason(problem.closure);
  const warning = problem.closure.warnings.join(' ');

  const take = (entry: OfferedProblemAction) => {
    setMenuOpen(false);
    write.reset();
    setDialog(entry.key);
  };

  return (
    <>
      <StickyActionBar
        note={
          blocked || warning ? (
            <AppText size="xs" tone={blocked ? 'danger' : 'warning'}>
              {blocked ?? warning}
            </AppText>
          ) : undefined
        }
      >
        {primary ? (
          <Grow>
            <Button
              label={primary.label}
              icon={primary.icon}
              variant={primary.danger ? 'danger' : 'primary'}
              onPress={() => take(primary)}
            />
          </Grow>
        ) : null}
        <Grow>
          <Button
            label="More actions"
            icon="ellipsis-horizontal"
            variant="secondary"
            onPress={() => setMenuOpen(true)}
          />
        </Grow>
      </StickyActionBar>

      <Sheet
        visible={menuOpen}
        title="Actions"
        subtitle={`${problem.key} · ${problem.title}`}
        onClose={() => setMenuOpen(false)}
      >
        {offered.map((entry) => (
          <ListRow
            key={entry.key}
            icon={entry.icon}
            iconTone={entry.enabled ? 'primary' : 'neutral'}
            title={entry.label}
            subtitle={entry.enabled ? null : (entry.reason ?? null)}
            destructive={entry.enabled && Boolean(entry.danger)}
            {...(entry.enabled ? { onPress: () => take(entry) } : {})}
          />
        ))}
      </Sheet>

      {dialog === 'request-rca' ? <RequestRcaSheet problem={problem} onClose={close} /> : null}
      {dialog === 'assign-fix' ? <AssignFixSheet problem={problem} onClose={close} /> : null}
      {dialog === 'edit' ? (
        <ProblemFormSheet problem={problem} onClose={close} onSaved={close} />
      ) : null}
      {dialog === 'ask' ? (
        <TextActionSheet
          title="Ask the developer"
          subtitle={problem.owner ? `Goes to ${problem.owner.name}` : 'Goes to the problem’s owner'}
          label="Your question"
          submitLabel="Ask"
          submitIcon="send-outline"
          busy={write.busy}
          error={write.error}
          onClose={close}
          onSubmit={(body) => void write.run({ action: 'ask-developer', body: { body } })}
        />
      ) : null}
      {dialog === 'preventive-test' ? (
        <TextActionSheet
          title="Add a preventive test"
          label="The test that stops this coming back"
          submitLabel="Record it"
          minLength={3}
          maxLength={2000}
          initialValue={problem.preventiveTest ?? ''}
          busy={write.busy}
          error={write.error}
          onClose={close}
          onSubmit={(preventiveTest) =>
            void write.run({ action: 'preventive-test', body: { preventiveTest } })
          }
        />
      ) : null}
      {dialog === 'close' ? (
        <TextActionSheet
          title="Close the problem"
          {...(warning ? { subtitle: warning } : {})}
          label="Closing note"
          hint="Optional"
          submitLabel="Close problem"
          submitIcon="checkmark-done-outline"
          danger
          minLength={0}
          maxLength={2000}
          busy={write.busy}
          error={write.error}
          onClose={close}
          onSubmit={(note) => void write.run({ action: 'close', body: note ? { note } : {} })}
        />
      ) : null}
    </>
  );
}
