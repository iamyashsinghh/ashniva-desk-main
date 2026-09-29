import type { TestingAssignmentDetail } from '@ashniva/types';

import { KeyValueRow, ListRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { formatDate, formatDateTime } from '../../shared/format/format';

/**
 * The web page's "Details" card: when, who, and a way to see where the project is deployed.
 * The environments list opens as a sheet over this screen rather than a route of its own.
 */
export function AssignmentDetailsSection({
  assignment,
  onOpenEnvironments,
  onOpenProject,
}: {
  assignment: TestingAssignmentDetail;
  onOpenEnvironments: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const due = formatDate(assignment.dueAt);
  return (
    <Section title="Details" icon="information-circle-outline">
      <KeyValueRow
        label="Due"
        value={due ? `${due}${assignment.isOverdue ? ' · overdue' : ''}` : '—'}
        {...(assignment.isOverdue ? { tone: 'danger' as const } : {})}
      />
      <KeyValueRow
        label="Tester"
        value={assignment.assignedToName ?? 'Unassigned — anyone in QA can pick this up'}
      />
      <KeyValueRow label="Handed over by" value={assignment.assignedByName} />
      <KeyValueRow label="Started" value={formatDateTime(assignment.startedAt) ?? '—'} />
      <KeyValueRow label="Finished" value={formatDateTime(assignment.completedAt) ?? '—'} />
      {onOpenProject ? (
        <ListRow
          title={assignment.projectName}
          subtitle="Project"
          icon="folder-open-outline"
          iconTone="info"
          onPress={() => onOpenProject(assignment.projectId)}
        />
      ) : null}
      <ListRow
        title="Where this project is deployed"
        subtitle="Test environments"
        icon="server-outline"
        iconTone="teal"
        onPress={onOpenEnvironments}
      />
    </Section>
  );
}
