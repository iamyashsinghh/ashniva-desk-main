import { PERMISSIONS, type TestEnvironmentRow } from '@ashniva/types';
import { useState } from 'react';

import { useResource } from '../../../shared/api/queries';
import { ListRow } from '../../../shared/components/data-display';
import { Button, Pill } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { QueryState } from '../../../shared/components/states';
import { formatDateTime } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import {
  ENVIRONMENT_LABELS,
  ENVIRONMENT_STATUS_LABELS,
  ENVIRONMENT_STATUS_TONES,
} from '../qa-labels';
import { EnvironmentFormView } from './EnvironmentFormView';

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; environment: TestEnvironmentRow };

export interface ProjectTestEnvironmentsSheetProps {
  visible: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
}

/**
 * Where a project is deployed, what is on it and whether it is up.
 *
 * Reading the list is part of reading the project; recording or editing one is part of looking
 * after the test estate, which the API gates with `test-account:manage`. The add and edit
 * controls are drawn only for somebody who holds it.
 */
export function ProjectTestEnvironmentsSheet({
  visible,
  projectId,
  projectName,
  onClose,
}: ProjectTestEnvironmentsSheetProps) {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const environments = useResource<TestEnvironmentRow[]>(
    ['qa', 'environments', projectId],
    `/projects/${projectId}/environments`,
    { enabled: visible },
  );
  const back = () => setMode({ kind: 'list' });
  const rows = environments.data ?? [];

  let title = 'Test environments';
  if (mode.kind === 'new') {
    title = 'Add an environment';
  } else if (mode.kind === 'edit') {
    title = `Edit ${ENVIRONMENT_LABELS[mode.environment.kind]}`;
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle={projectName}
      onClose={() => {
        back();
        onClose();
      }}
      maxHeightRatio={0.94}
    >
      {mode.kind === 'list' ? (
        <>
          {canManage ? (
            <Button
              label="Add an environment"
              icon="add"
              onPress={() => setMode({ kind: 'new' })}
            />
          ) : null}
          <QueryState
            isLoading={environments.isLoading}
            error={environments.error}
            isEmpty={rows.length === 0}
            emptyTitle="No environments recorded"
            emptyDescription="Record where this project is deployed so testers know where to go."
            emptyIcon="server-outline"
            onRetry={() => void environments.refetch()}
          >
            {rows.map((environment) => (
              <ListRow
                key={environment.id}
                title={`${ENVIRONMENT_LABELS[environment.kind]} — ${environment.url}`}
                subtitle={deploymentLine(environment)}
                icon="server-outline"
                trailing={
                  <Pill
                    label={ENVIRONMENT_STATUS_LABELS[environment.status]}
                    tone={ENVIRONMENT_STATUS_TONES[environment.status]}
                  />
                }
                {...(canManage
                  ? {
                      onPress: () => setMode({ kind: 'edit', environment }),
                      accessibilityHint: 'Edit this environment',
                    }
                  : {})}
              />
            ))}
          </QueryState>
        </>
      ) : (
        <EnvironmentFormView
          projectId={projectId}
          {...(mode.kind === 'edit' ? { existing: mode.environment } : {})}
          onDone={back}
        />
      )}
    </Sheet>
  );
}

function deploymentLine(environment: TestEnvironmentRow): string {
  const parts = [
    environment.deployedVersion ? `Version ${environment.deployedVersion}` : null,
    environment.deployedAt ? `deployed ${formatDateTime(environment.deployedAt)}` : null,
    environment.githubEnvironmentName ? `GitHub: ${environment.githubEnvironmentName}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : 'Nothing recorded about the last deploy';
}
