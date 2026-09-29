import { DateTimeField } from '../../shared/components/DateTimeField';
import { Field, Input } from '../../shared/components/primitives';

export interface ApprovalWording {
  title: string;
  summary: string;
  dueDate: string | null;
  internalNotes: string;
}

/** The API's own minimums, checked here so a one-word summary is caught before a round trip. */
export function wordingProblems(wording: ApprovalWording): { title?: string; summary?: string } {
  return {
    ...(wording.title.trim().length < 3 ? { title: 'At least 3 characters' } : {}),
    ...(wording.summary.trim().length < 3 ? { summary: 'At least 3 characters' } : {}),
  };
}

/** The body both `POST /approvals` and `PATCH /approvals/:id` take for the wording. */
export function wordingBody(wording: ApprovalWording) {
  return {
    title: wording.title.trim(),
    summary: wording.summary.trim(),
    dueDate: wording.dueDate,
    internalNotes: wording.internalNotes.trim() || null,
  };
}

/**
 * Title, the summary the client reads, the date and the notes they never do — the same four
 * fields whether a request is being prepared or reworded.
 */
export function ApprovalWordingFields({
  value,
  onChange,
}: {
  value: ApprovalWording;
  onChange: (next: ApprovalWording) => void;
}) {
  const problems = wordingProblems(value);
  return (
    <>
      <Field label="Title" required error={problems.title ?? null}>
        <Input
          accessibilityLabel="Title"
          value={value.title}
          onChangeText={(title) => onChange({ ...value, title })}
          maxLength={200}
          invalid={Boolean(problems.title)}
        />
      </Field>
      <Field
        label="What the client is approving"
        required
        hint="Shown to the client"
        error={problems.summary ?? null}
      >
        <Input
          accessibilityLabel="What the client is approving"
          value={value.summary}
          onChangeText={(summary) => onChange({ ...value, summary })}
          multiline
          numberOfLines={4}
          maxLength={5000}
          invalid={Boolean(problems.summary)}
          style={{ minHeight: 110 }}
        />
      </Field>
      <DateTimeField
        label="Decision needed by"
        value={value.dueDate}
        onChange={(dueDate) => onChange({ ...value, dueDate })}
      />
      <Field label="Internal notes" hint="Never shown to the client">
        <Input
          accessibilityLabel="Internal notes"
          value={value.internalNotes}
          onChangeText={(internalNotes) => onChange({ ...value, internalNotes })}
          multiline
          numberOfLines={2}
          maxLength={5000}
          style={{ minHeight: 72 }}
        />
      </Field>
    </>
  );
}
