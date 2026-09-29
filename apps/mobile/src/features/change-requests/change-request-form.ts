import type { ChangeRequestDetail } from '@ashniva/types';

/**
 * The change-request form, as on the web: raising one picks the client, who asked, and the
 * contract; editing one changes the words and the project, and leaves who and which contract
 * alone, because those are settled when it is raised.
 */

export interface ChangeRequestFormState {
  clientOrganizationId: string | null;
  requestedById: string | null;
  contractId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  businessReason: string;
  scope: string;
  impact: string;
}

export type ChangeRequestFormErrors = Partial<Record<keyof ChangeRequestFormState, string>>;

export function initialChangeRequestForm(
  existing: ChangeRequestDetail | null,
): ChangeRequestFormState {
  return {
    clientOrganizationId: existing?.clientOrganization.id ?? null,
    requestedById: null,
    contractId: null,
    projectId: existing?.project?.id ?? null,
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    businessReason: existing?.businessReason ?? '',
    scope: existing?.scope ?? '',
    impact: existing?.impact ?? '',
  };
}

export function validateChangeRequestForm(
  form: ChangeRequestFormState,
  editing: boolean,
): ChangeRequestFormErrors {
  const errors: ChangeRequestFormErrors = {};
  if (!editing && !form.clientOrganizationId) {
    errors.clientOrganizationId = 'Choose the client this change is for.';
  }
  if (form.title.trim().length < 3) {
    errors.title = 'At least 3 characters.';
  }
  if (form.description.trim().length < 10) {
    errors.description = 'Describe the change in at least 10 characters.';
  }
  return errors;
}

export function changeRequestPayload(
  form: ChangeRequestFormState,
  editing: boolean,
): Record<string, unknown> {
  const text = {
    title: form.title.trim(),
    description: form.description.trim(),
    businessReason: form.businessReason.trim() || null,
    scope: form.scope.trim() || null,
    impact: form.impact.trim() || null,
  };
  if (editing) {
    return { ...text, projectId: form.projectId };
  }
  // The create DTO takes optional fields as absent rather than null.
  const optional = (value: string | null) => value ?? undefined;
  return Object.fromEntries(
    Object.entries({
      ...text,
      businessReason: optional(text.businessReason),
      scope: optional(text.scope),
      impact: optional(text.impact),
      projectId: optional(form.projectId),
      clientOrganizationId: optional(form.clientOrganizationId),
      requestedById: optional(form.requestedById),
      contractId: optional(form.contractId),
    }).filter(([, value]) => value !== undefined),
  );
}
