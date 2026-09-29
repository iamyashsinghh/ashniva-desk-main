import { PERMISSIONS, type TestAccountSummary, type TestEnvironmentRow } from '@ashniva/types';
import { useState } from 'react';

import { useResource } from '../../../shared/api/queries';
import { Banner } from '../../../shared/components/feedback';
import { Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { QueryState } from '../../../shared/components/states';
import { useSession } from '../../auth/SessionProvider';
import { AccessLog } from './AccessLog';
import { GrantAccessView } from './GrantAccessView';
import { RotateView } from './RotateView';
import { TestAccountCard } from './TestAccountCard';
import { TestAccountFormView } from './TestAccountFormView';

type Mode =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; account: TestAccountSummary }
  | { kind: 'grant'; account: TestAccountSummary }
  | { kind: 'rotate'; account: TestAccountSummary };

export interface ProjectTestAccountsSheetProps {
  visible: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
}

/**
 * A project's test logins: which exist, who may read one now, and who has.
 *
 * The web page's forms become steps inside this one sheet rather than sheets of their own, because
 * a second modal presented over the first is not reliably shown on iOS. Every read and write here
 * needs `test-account:manage`, so without it the sheet explains itself instead of loading.
 */
export function ProjectTestAccountsSheet({
  visible,
  projectId,
  projectName,
  onClose,
}: ProjectTestAccountsSheetProps) {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const accounts = useResource<TestAccountSummary[]>(
    ['qa', 'test-accounts', projectId],
    `/projects/${projectId}/test-accounts`,
    { enabled: visible && canManage },
  );
  const environments = useResource<TestEnvironmentRow[]>(
    ['qa', 'environments', projectId],
    `/projects/${projectId}/environments`,
    { enabled: visible && canManage },
  );
  const back = () => setMode({ kind: 'list' });
  const close = () => {
    back();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={sheetTitle(mode)}
      subtitle={projectName}
      onClose={close}
      maxHeightRatio={0.94}
    >
      {canManage ? (
        <ModeBody
          mode={mode}
          projectId={projectId}
          accounts={accounts.data ?? []}
          environments={environments.data ?? []}
          isLoading={accounts.isLoading}
          error={accounts.error}
          onRetry={() => void accounts.refetch()}
          setMode={setMode}
          onBack={back}
        />
      ) : (
        <Banner tone="info">
          Test logins are looked after by people with the test-account:manage permission. Ask one of
          them to grant you access.
        </Banner>
      )}
    </Sheet>
  );
}

function ModeBody({
  mode,
  projectId,
  accounts,
  environments,
  isLoading,
  error,
  onRetry,
  setMode,
  onBack,
}: {
  mode: Mode;
  projectId: string;
  accounts: TestAccountSummary[];
  environments: TestEnvironmentRow[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  setMode: (mode: Mode) => void;
  onBack: () => void;
}) {
  switch (mode.kind) {
    case 'new':
      return (
        <TestAccountFormView projectId={projectId} environments={environments} onDone={onBack} />
      );
    case 'edit':
      return (
        <TestAccountFormView
          projectId={projectId}
          environments={environments}
          existing={mode.account}
          onDone={onBack}
        />
      );
    case 'grant':
      return <GrantAccessView account={mode.account} onDone={onBack} />;
    case 'rotate':
      return <RotateView account={mode.account} onDone={onBack} />;
    case 'list':
      return (
        <>
          <Button label="New test login" icon="add" onPress={() => setMode({ kind: 'new' })} />
          <QueryState
            isLoading={isLoading}
            error={error}
            isEmpty={accounts.length === 0}
            emptyTitle="No test logins yet"
            emptyDescription="Record the shared logins testers use, so nobody passes one around in chat."
            emptyIcon="key-outline"
            onRetry={onRetry}
          >
            {accounts.map((account) => (
              <TestAccountCard
                key={account.id}
                account={account}
                onGrant={() => setMode({ kind: 'grant', account })}
                onRotate={() => setMode({ kind: 'rotate', account })}
                onEdit={() => setMode({ kind: 'edit', account })}
              />
            ))}
          </QueryState>
          <AccessLog projectId={projectId} />
        </>
      );
  }
}

function sheetTitle(mode: Mode): string {
  switch (mode.kind) {
    case 'new':
      return 'New test login';
    case 'edit':
      return `Edit ${mode.account.label}`;
    case 'grant':
      return `Grant access to ${mode.account.label}`;
    case 'rotate':
      return `Rotate ${mode.account.label}`;
    case 'list':
      return 'Test logins';
  }
}
