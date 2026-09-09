import { AI_SUMMARY_TYPE_LABELS, isClientFacingSummary, type AiSummaryType } from '@ashniva/types';
import { Alert, Button, FormField, FormGrid, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { todayIso } from '../../../shared/lib/format';
import { useProjectsQuery } from '../../projects/api';
import { useUsersQuery } from '../../users/api';
import { useAiSummaryMutations } from '../api';

const TYPES = Object.keys(AI_SUMMARY_TYPE_LABELS) as AiSummaryType[];

/** Types that summarise one person's day rather than a project's. */
const PERSON_TYPES: AiSummaryType[] = ['DEVELOPER_DAILY', 'LEAD_DAILY'];

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Start a summary.
 *
 * Creating it and generating it are two calls, and the modal does both: a summary that exists but
 * has never been generated is a confusing thing to leave someone with.
 */
export function GenerateSummaryModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [created, setCreated] = useState<string | undefined>();
  const { create } = useAiSummaryMutations();
  const { generate } = useAiSummaryMutations(created);
  const { error, wrap } = useSubmitHandler(onClose);

  const [form, setForm] = useState({
    type: 'LEAD_DAILY' as AiSummaryType,
    projectId: '',
    subjectUserId: '',
    periodStart: daysAgo(7),
    periodEnd: todayIso(),
  });

  const projects = useProjectsQuery({});
  const users = useUsersQuery();

  const needsPerson = PERSON_TYPES.includes(form.type);
  const clientFacing = isClientFacingSummary(form.type);
  // A client-facing summary needs a project, because that is how the client is known.
  const valid = clientFacing
    ? Boolean(form.projectId)
    : !needsPerson || Boolean(form.subjectUserId);

  const run = async () => {
    const summary = await create.mutateAsync({
      type: form.type,
      projectId: form.projectId || undefined,
      subjectUserId: needsPerson ? form.subjectUserId || undefined : undefined,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    });
    setCreated(summary.id);
    await navigate(`/ai-summaries/${summary.id}`);
  };

  return (
    <Modal
      open
      size="lg"
      title="New progress summary"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || generate.isPending}
            disabled={!valid}
            disabledReason="Choose what the summary is about"
            onClick={() => void wrap(run)()}
          >
            Create and generate
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="What kind of summary" required>
          <Select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as AiSummaryType })}
            options={TYPES.map((value) => ({ value, label: AI_SUMMARY_TYPE_LABELS[value] }))}
          />
        </FormField>

        <FormField
          label="Project"
          required={clientFacing}
          hint={clientFacing ? 'Decides which client may eventually read it' : 'Optional'}
        >
          <Select
            value={form.projectId}
            placeholder="Any project"
            onChange={(event) => setForm({ ...form, projectId: event.target.value })}
            options={(projects.data ?? []).map((project) => ({
              value: project.id,
              label: `${project.code} — ${project.name}`,
            }))}
          />
        </FormField>

        {needsPerson ? (
          <FormField label="Person" required>
            <Select
              value={form.subjectUserId}
              placeholder="Choose someone"
              onChange={(event) => setForm({ ...form, subjectUserId: event.target.value })}
              options={(users.data ?? []).map((user) => ({ value: user.id, label: user.name }))}
            />
          </FormField>
        ) : null}

        <FormField label="From" required>
          <Input
            type="date"
            value={form.periodStart}
            onChange={(event) => setForm({ ...form, periodStart: event.target.value })}
          />
        </FormField>
        <FormField label="To" required hint="Inclusive">
          <Input
            type="date"
            value={form.periodEnd}
            onChange={(event) => setForm({ ...form, periodEnd: event.target.value })}
          />
        </FormField>

        <p className="muted">
          {clientFacing
            ? 'This type may eventually be shown to the client, so it is generated only from records that are already client-visible. It still has to be reviewed and approved before anyone outside the team sees it.'
            : 'This is an internal summary. It is never shown to a client, and publishing it is not an option.'}
        </p>

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </FormGrid>
    </Modal>
  );
}
