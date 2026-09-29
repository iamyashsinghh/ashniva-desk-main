import {
  AI_SUMMARY_TYPE_LABELS,
  PERMISSIONS,
  isClientFacingSummary,
  type AiSummaryType,
} from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { ProjectPicker, UserPicker } from '../../shared/components/pickers';
import { AppText, Button } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { Sheet } from '../../shared/components/Sheet';
import { todayIsoDate } from '../../shared/format/format';
import { useSession } from '../auth/SessionProvider';
import { useCreateAiSummary, useGenerateAiSummary } from './api';
import { PERSON_TYPES, daysAgoIso } from './summary-display';

const TYPE_OPTIONS = (Object.keys(AI_SUMMARY_TYPE_LABELS) as AiSummaryType[]).map((value) => ({
  value,
  label: AI_SUMMARY_TYPE_LABELS[value],
  description: isClientFacingSummary(value) ? 'May be published to the client' : 'Internal only',
}));

function blankForm() {
  return {
    type: 'LEAD_DAILY' as AiSummaryType,
    projectId: null as string | null,
    subjectUserId: null as string | null,
    periodStart: daysAgoIso(7),
    periodEnd: todayIsoDate(),
  };
}

/**
 * Start a summary: what it is about and the period it covers.
 *
 * Creating and generating are two calls and the sheet makes both, so nobody is left holding a
 * summary that exists but has never been generated. If generation cannot be queued the summary
 * still opens — as a draft with its own "Generate" button — rather than the work being lost.
 */
export function GenerateSummarySheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { can } = useSession();
  const [form, setForm] = useState(blankForm);
  const create = useCreateAiSummary();
  const generate = useGenerateAiSummary();

  const needsPerson = PERSON_TYPES.includes(form.type);
  const clientFacing = isClientFacingSummary(form.type);
  const canPickProject = can(PERMISSIONS.PROJECT_READ);
  const canPickPerson = can(PERMISSIONS.TASK_READ);
  const periodError =
    form.periodEnd < form.periodStart ? 'The period ends before it starts.' : null;
  // A client-facing summary needs a project, because that is how the client is known.
  const valid =
    !periodError &&
    (clientFacing ? Boolean(form.projectId) : !needsPerson || Boolean(form.subjectUserId));

  const submit = async () => {
    const created = await create.run({
      type: form.type,
      ...(form.projectId ? { projectId: form.projectId } : {}),
      ...(needsPerson && form.subjectUserId ? { subjectUserId: form.subjectUserId } : {}),
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    });
    if (!created) {
      return;
    }
    await generate.run(created.id);
    setForm(blankForm());
    onCreated(created.id);
  };

  return (
    <Sheet
      visible={visible}
      title="New progress summary"
      subtitle="Generated as a draft; a person reviews it before anyone else reads it."
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Create and generate"
            icon="sparkles-outline"
            loading={create.busy || generate.busy}
            disabled={!valid}
            onPress={() => void submit()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SelectField
        label="What kind of summary"
        icon="pricetag-outline"
        required
        options={TYPE_OPTIONS}
        value={[form.type]}
        onChange={(values) => setForm({ ...form, type: values[0] ?? form.type })}
      />
      {canPickProject ? (
        <ProjectPicker
          value={form.projectId}
          onChange={(projectId) => setForm({ ...form, projectId })}
          allowClear={!clientFacing}
          placeholder="Any project"
          required={clientFacing}
          hint={clientFacing ? 'Decides which client may eventually read it' : 'Optional'}
        />
      ) : null}
      {needsPerson && canPickPerson ? (
        <UserPicker
          label="Person"
          required
          value={form.subjectUserId ? [form.subjectUserId] : []}
          onChange={(ids) => setForm({ ...form, subjectUserId: ids[0] ?? null })}
          placeholder="Choose someone"
          allowClear={false}
        />
      ) : null}
      <DateTimeField
        label="From"
        required
        allowClear={false}
        value={form.periodStart}
        onChange={(value) => setForm({ ...form, periodStart: value ?? form.periodStart })}
      />
      <DateTimeField
        label="To"
        required
        allowClear={false}
        hint="Inclusive"
        error={periodError}
        value={form.periodEnd}
        onChange={(value) => setForm({ ...form, periodEnd: value ?? form.periodEnd })}
      />
      <AppText size="sm" tone="muted">
        {clientFacing
          ? 'This type may eventually be shown to the client, so it is generated only from records that are already client-visible. It still has to be reviewed and approved before anyone outside the team sees it.'
          : 'This is an internal summary. It is never shown to a client, and publishing it is not an option.'}
      </AppText>
      {(clientFacing && !canPickProject) || (needsPerson && !canPickPerson) ? (
        <Banner tone="warning">
          {clientFacing
            ? 'This type needs a project, and your role cannot list projects.'
            : 'This type needs a person, and your role cannot list people.'}
        </Banner>
      ) : null}
      {create.error ? (
        <Banner tone="danger" role="alert">
          {create.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
