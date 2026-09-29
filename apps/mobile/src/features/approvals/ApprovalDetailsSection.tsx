import type { ApprovalDetail } from '@ashniva/types';

import { KeyValueRow, ListRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { formatDate } from '../../shared/format/format';
import { byLine } from './approval-display';

/**
 * Who did what to a request, and what it hangs off — the web page's "Details" card.
 *
 * The project is a row that opens it when the navigator passed a way to; the contract is named
 * but not opened, because contracts are an administration screen that stays on the web.
 */
export function ApprovalDetailsSection({
  approval,
  onOpenProject,
}: {
  approval: ApprovalDetail;
  onOpenProject?: (projectId: string) => void;
}) {
  const project = approval.project;
  return (
    <Section title="Details" icon="information-circle-outline">
      <KeyValueRow label="Client" value={approval.clientOrganization.name} />
      {project && onOpenProject ? (
        <ListRow
          title={project.name}
          subtitle="Project"
          icon="folder-open-outline"
          iconTone="info"
          onPress={() => onOpenProject(project.id)}
        />
      ) : (
        <KeyValueRow label="Project" value={project?.name ?? '—'} />
      )}
      <KeyValueRow label="Contract" value={approval.contract?.number ?? '—'} />
      <KeyValueRow label="Requested by" value={approval.requestedBy.name} />
      <KeyValueRow
        label="Reviewed by"
        value={byLine(approval.internalReviewer, approval.internalReviewedAt)}
      />
      <KeyValueRow label="Published" value={byLine(approval.publishedBy, approval.publishedAt)} />
      <KeyValueRow
        label="Decision needed by"
        value={formatDate(approval.dueDate) ?? '—'}
        {...(approval.isOverdue ? { tone: 'danger' as const } : {})}
      />
      <KeyValueRow label="Decided" value={byLine(approval.decidedBy, approval.decidedAt)} />
    </Section>
  );
}
