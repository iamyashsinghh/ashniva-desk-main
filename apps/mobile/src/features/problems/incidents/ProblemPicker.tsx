import {
  OPEN_PROBLEM_STATUSES,
  PERMISSIONS,
  PROBLEM_STATUS_LABELS,
  type PaginatedResponse,
  type ProblemSummary,
} from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../../shared/api/queries';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useSession } from '../../auth/SessionProvider';
import { problemKeys } from '../problem-api';

const QUERY = { status: OPEN_PROBLEM_STATUSES.join(','), limit: 100 };

/**
 * The open problem an incident is of, when there is one. Only drawn for somebody who can read
 * problems — `GET /problems` needs `problem:read`, which `incident:manage` does not imply.
 */
export function ProblemPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (problemId: string | null) => void;
}) {
  const { can } = useSession();
  const allowed = can(PERMISSIONS.PROBLEM_READ);
  const problems = useResource<PaginatedResponse<ProblemSummary>>(
    problemKeys.list({ picker: true, ...QUERY }),
    '/problems',
    { query: QUERY, enabled: allowed },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (problems.data?.items ?? []).map((problem) => ({
        value: problem.id,
        label: `${problem.key} · ${problem.title}`,
        description: PROBLEM_STATUS_LABELS[problem.status],
        icon: 'bug-outline',
        iconTone: 'danger',
      })),
    [problems.data],
  );

  if (!allowed) {
    return null;
  }
  return (
    <SelectField
      label="Problem behind it"
      icon="bug-outline"
      options={options}
      value={value ? [value] : []}
      onChange={(ids) => onChange(ids[0] ?? null)}
      allowClear
      clearLabel="None"
      placeholder="None"
      loading={problems.isLoading}
      hint="The recurring fault this incident is of, if one is open"
    />
  );
}
