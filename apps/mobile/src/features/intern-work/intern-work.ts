import {
  PERMISSIONS,
  PRIORITY,
  ROLE_KEYS,
  TASK_LIST_VIEW,
  isManagerRole,
  type DirectoryEntry,
  type PermissionKey,
  type Priority,
  type ProjectSummary,
  type RoleKey,
} from '@ashniva/types';

import type { SelectOption } from '../../shared/components/SelectSheet';

/**
 * The rules behind the intern-work screens, kept apart from the drawing so they can be tested.
 *
 * Every rule here is the web's own (`InternWorkPage`, `CreateInternWorkPage`), repeated so the two
 * apps offer the same doors. The API still decides every request.
 */

/** `GET /tasks?view=intern` — the board the web page reads. */
export const INTERN_WORK_QUERY: Readonly<Record<string, string>> = {
  view: TASK_LIST_VIEW.INTERN,
};

/**
 * Who is offered "Assign work": a manager role (director, project manager, team lead) that also
 * holds `task:assign`. Either half alone is not enough — the web checks both.
 */
export function mayAssignInternWork(
  user: { roleKey: RoleKey } | null,
  can: (permission: PermissionKey) => boolean,
): boolean {
  return Boolean(user && isManagerRole(user.roleKey) && can(PERMISSIONS.TASK_ASSIGN));
}

export function isInternUser(user: { roleKey: RoleKey } | null): boolean {
  return user?.roleKey === ROLE_KEYS.INTERN;
}

/** The roster filter for the intern picker. Module-level so the picker's memo holds. */
export function isIntern(person: DirectoryEntry): boolean {
  return person.roleKey === ROLE_KEYS.INTERN;
}

export interface InternWorkCopy {
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
}

/** The intern reads about their own work; everybody else reads about handing it out. */
export function internWorkCopy(intern: boolean): InternWorkCopy {
  return intern
    ? {
        subtitle:
          'Work assigned to you. Open a task to reply in comments and upload attachments with a short note on what each file is for.',
        emptyTitle: 'No intern work yet',
        emptyDescription:
          'When a director, project manager or team lead assigns you work, it will appear here.',
      }
    : {
        subtitle:
          'Assign learning work to interns. Only the person who assigns it, the intern, and Super Admin can see each assignment.',
        emptyTitle: 'No assignments yet',
        emptyDescription:
          'Assign clear, time-boxed learning work. The intern replies and attaches files on the task.',
      };
}

export const PRIORITIES: readonly Priority[] = Object.values(PRIORITY);

export interface InternWorkValues {
  title: string;
  description: string;
  projectId: string | null;
  assignedToId: string | null;
  dueDate: string | null;
  priority: Priority;
}

export type InternWorkErrors = Partial<Record<'title' | 'assignedToId', string>>;

export function emptyInternWork(today: string): InternWorkValues {
  return {
    title: '',
    description: '',
    projectId: null,
    assignedToId: null,
    dueDate: today,
    priority: PRIORITY.MEDIUM,
  };
}

/** The web form's two checks; the title minimum is also the API's `@MinLength(3)`. */
export function validateInternWork(values: InternWorkValues): InternWorkErrors {
  const errors: InternWorkErrors = {};
  if (values.title.trim().length < 3) {
    errors.title = 'Give the work a clear title';
  }
  if (!values.assignedToId) {
    errors.assignedToId = 'Choose an intern';
  }
  return errors;
}

/** What `POST /tasks` is sent. Intern work is never client-visible, whatever else changes. */
export interface CreateInternTaskBody {
  title: string;
  description?: string;
  projectId?: string;
  assignedToId: string;
  dueDate?: string;
  priority: Priority;
  isInternTask: true;
  clientVisible: false;
}

/** Call only after `validateInternWork` has passed: the intern is required by then. */
export function toInternTaskBody(values: InternWorkValues): CreateInternTaskBody {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    ...(description ? { description } : {}),
    ...(values.projectId ? { projectId: values.projectId } : {}),
    assignedToId: values.assignedToId ?? '',
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    priority: values.priority,
    isInternTask: true,
    clientVisible: false,
  };
}

/** Active projects as the web labels them: "code · name". */
export function projectOptions(projects: readonly ProjectSummary[]): SelectOption[] {
  return projects.map((project) => ({
    value: project.id,
    label: `${project.code} · ${project.name}`,
    ...(project.clientOrganization ? { description: project.clientOrganization.name } : {}),
    icon: 'folder-open-outline',
    iconTone: 'teal',
  }));
}
