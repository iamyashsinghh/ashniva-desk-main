import {
  TEST_ENVIRONMENT,
  TEST_ENVIRONMENT_STATUS,
  type TestEnvironment,
  type TestEnvironmentRow,
  type TestEnvironmentStatus,
} from '@ashniva/types';

export interface EnvironmentForm {
  kind: TestEnvironment;
  url: string;
  status: TestEnvironmentStatus;
  deployedVersion: string;
  /** An ISO instant, or null when nobody has said when it went out. */
  deployedAt: string | null;
  githubEnvironmentName: string;
}

export function initialEnvironmentForm(existing?: TestEnvironmentRow): EnvironmentForm {
  return {
    kind: existing?.kind ?? TEST_ENVIRONMENT.STAGING,
    url: existing?.url ?? '',
    status: existing?.status ?? TEST_ENVIRONMENT_STATUS.UNKNOWN,
    deployedVersion: existing?.deployedVersion ?? '',
    deployedAt: existing?.deployedAt ?? null,
    githubEnvironmentName: existing?.githubEnvironmentName ?? '',
  };
}

export function isEnvironmentValid(form: EnvironmentForm): boolean {
  return form.url.trim().length > 0;
}

/** The kind is sent only when recording one: it is fixed once the environment exists. */
export function environmentBody(form: EnvironmentForm, editing: boolean) {
  return {
    ...(editing ? {} : { kind: form.kind }),
    url: form.url.trim(),
    status: form.status,
    deployedVersion: form.deployedVersion.trim() || undefined,
    deployedAt: form.deployedAt ?? undefined,
    githubEnvironmentName: form.githubEnvironmentName.trim() || undefined,
  };
}
