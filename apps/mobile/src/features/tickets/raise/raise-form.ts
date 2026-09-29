import { PRIORITY, TICKET_TYPE, type Priority, type TicketType } from '@ashniva/types';

/** The API's own limits (`CreateTicketDto`), checked here so a typo is caught before the round trip. */
export const RAISE_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  descriptionMin: 3,
  descriptionMax: 5000,
  impactMax: 1000,
  moduleMax: 80,
  versionMax: 60,
  files: 10,
} as const;

export interface RaiseForm {
  title: string;
  description: string;
  impact: string;
  type: TicketType;
  priority: Priority;
  module: string;
  productVersion: string;
  projectId: string | null;
  /** Staff only: the client company the ticket is raised for; null is the provider's own. */
  clientOrganizationId: string | null;
}

export const EMPTY_RAISE_FORM: RaiseForm = {
  title: '',
  description: '',
  impact: '',
  type: TICKET_TYPE.SUPPORT,
  priority: PRIORITY.MEDIUM,
  module: '',
  productVersion: '',
  projectId: null,
  clientOrganizationId: null,
};

export type RaiseErrors = Partial<
  Record<'title' | 'description' | 'impact' | 'module' | 'productVersion', string>
>;

export function validateRaise(form: RaiseForm): RaiseErrors {
  const errors: RaiseErrors = {};
  const title = form.title.trim();
  const description = form.description.trim();
  if (title.length < RAISE_LIMITS.titleMin) {
    errors.title = 'Give the ticket a short title';
  } else if (title.length > RAISE_LIMITS.titleMax) {
    errors.title = `Keep the title under ${RAISE_LIMITS.titleMax} characters`;
  }
  if (description.length < RAISE_LIMITS.descriptionMin) {
    errors.description = 'Describe what is happening';
  } else if (description.length > RAISE_LIMITS.descriptionMax) {
    errors.description = `Keep the description under ${RAISE_LIMITS.descriptionMax} characters`;
  }
  if (form.impact.trim().length > RAISE_LIMITS.impactMax) {
    errors.impact = `Keep this under ${RAISE_LIMITS.impactMax} characters`;
  }
  if (form.module.trim().length > RAISE_LIMITS.moduleMax) {
    errors.module = `Keep this under ${RAISE_LIMITS.moduleMax} characters`;
  }
  if (form.productVersion.trim().length > RAISE_LIMITS.versionMax) {
    errors.productVersion = `Keep this under ${RAISE_LIMITS.versionMax} characters`;
  }
  return errors;
}

/** The request body: trimmed, with empty optional fields left out rather than sent as "". */
export function raiseBody(form: RaiseForm, fileIds: readonly string[]): Record<string, unknown> {
  const optional = {
    impact: form.impact.trim(),
    module: form.module.trim(),
    productVersion: form.productVersion.trim(),
    projectId: form.projectId ?? '',
    clientOrganizationId: form.clientOrganizationId ?? '',
  };
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    priority: form.priority,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== '')),
    ...(fileIds.length > 0 ? { fileIds: [...fileIds] } : {}),
  };
}
