import {
  PROJECT_STATUS,
  PROJECT_TYPE,
  ROLE_KEYS,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectType,
  type SessionUser,
} from '@ashniva/types';

/**
 * The project form's state and rules, kept out of the screen so they can be read — and tested —
 * without rendering anything.
 *
 * The rules are the web form's: a code the API will accept, a name, and a lead and a team, because
 * the team is what decides which developers and testers can see the project at all. The API is
 * still the judge; these only save a round trip for the mistakes that are certain.
 */

export interface ProjectFormState {
  code: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  clientOrganizationId: string | null;
  managerUserId: string | null;
  leadUserId: string | null;
  teamId: string | null;
  startDate: string | null;
  targetDate: string | null;
  requiresClientUat: boolean;
}

export type ProjectFormErrors = Partial<
  Record<'code' | 'name' | 'leadUserId' | 'teamId' | 'targetDate', string>
>;

/** What `POST /projects` and `PATCH /projects/:id` take. The code is fixed once tasks use it. */
export interface ProjectBody {
  code?: string;
  name: string;
  description?: string | null;
  type: ProjectType;
  status: ProjectStatus;
  clientOrganizationId: string | null;
  managerUserId: string | null;
  leadUserId: string | null;
  teamId: string | null;
  startDate: string | null;
  targetDate: string | null;
  requiresClientUat: boolean;
}

/** The API's rule: 2–8 letters or digits, starting with a letter. Hyphens are the task separator. */
const PROJECT_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;

export function sanitizeProjectCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/**
 * A new project starts with the person creating it in the seat their role implies — a project
 * manager usually creates the projects they will manage — as the web form does.
 */
export function initialProjectForm(
  project: ProjectDetail | null,
  me: SessionUser | null,
): ProjectFormState {
  if (project) {
    return {
      code: project.code,
      name: project.name,
      description: project.description ?? '',
      type: project.type,
      status: project.status,
      clientOrganizationId: project.clientOrganization?.id ?? null,
      managerUserId: project.manager?.id ?? null,
      leadUserId: project.lead?.id ?? null,
      teamId: project.team?.id ?? null,
      startDate: project.startDate,
      targetDate: project.targetDate,
      requiresClientUat: project.requiresClientUat,
    };
  }
  return {
    code: '',
    name: '',
    description: '',
    type: PROJECT_TYPE.FIXED_PRICE,
    status: PROJECT_STATUS.ACTIVE,
    clientOrganizationId: null,
    managerUserId: me?.roleKey === ROLE_KEYS.PROJECT_MANAGER ? me.id : null,
    leadUserId: me?.roleKey === ROLE_KEYS.TEAM_LEAD ? me.id : null,
    teamId: null,
    startDate: null,
    targetDate: null,
    requiresClientUat: false,
  };
}

export function validateProjectForm(form: ProjectFormState, editing: boolean): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  if (!editing && !PROJECT_CODE_PATTERN.test(sanitizeProjectCode(form.code))) {
    errors.code = '2–8 letters or digits, starting with a letter.';
  }
  if (form.name.trim().length < 2) {
    errors.name = 'Give the project a name of at least 2 characters.';
  }
  if (!form.leadUserId) {
    errors.leadUserId = 'Choose who will lead this team.';
  }
  if (!form.teamId) {
    errors.teamId = 'Choose which team this project belongs to.';
  }
  // Bare `YYYY-MM-DD` strings compare correctly as text.
  if (form.startDate && form.targetDate && form.targetDate < form.startDate) {
    errors.targetDate = 'Delivery cannot be before the start date.';
  }
  return errors;
}

export function projectPayload(form: ProjectFormState, editing: boolean): ProjectBody {
  const body: ProjectBody = {
    name: form.name.trim(),
    type: form.type,
    status: form.status,
    clientOrganizationId: form.clientOrganizationId,
    managerUserId: form.managerUserId,
    leadUserId: form.leadUserId,
    teamId: form.teamId,
    startDate: form.startDate,
    targetDate: form.targetDate,
    requiresClientUat: form.requiresClientUat,
  };
  if (!editing) {
    body.code = sanitizeProjectCode(form.code);
  }
  const description = form.description.trim();
  if (description) {
    body.description = description;
  } else if (editing) {
    // An update clears the description with null; a create simply leaves it out.
    body.description = null;
  }
  return body;
}
