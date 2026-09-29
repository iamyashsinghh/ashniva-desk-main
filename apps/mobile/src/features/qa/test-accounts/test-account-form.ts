import {
  CREDENTIAL_ROTATION_POLICY,
  TEST_ENVIRONMENT,
  type CredentialRotationPolicy,
  type TestAccountSummary,
  type TestEnvironment,
} from '@ashniva/types';

export interface AccountForm {
  environment: TestEnvironment;
  environmentId: string;
  label: string;
  username: string;
  /** Write-only: typed once, sent, and dropped with the form. Nothing reads it back. */
  secret: string;
  notes: string;
  rotationPolicy: CredentialRotationPolicy;
  isActive: boolean;
}

export const MIN_SECRET_LENGTH = 8;

export function initialAccountForm(existing?: TestAccountSummary): AccountForm {
  return {
    environment: existing?.environment ?? TEST_ENVIRONMENT.STAGING,
    environmentId: existing?.environmentId ?? '',
    label: existing?.label ?? '',
    username: existing?.username ?? '',
    secret: '',
    notes: existing?.notes ?? '',
    rotationPolicy: existing?.rotationPolicy ?? CREDENTIAL_ROTATION_POLICY.AFTER_TEST,
    isActive: existing?.isActive ?? true,
  };
}

/** The API's limits, said before sending so the save button can explain why it is off. */
export function missingAccountFields(form: AccountForm, editing: boolean): string[] {
  const missing: string[] = [];
  if (form.label.trim().length < 2) {
    missing.push('a label');
  }
  if (form.username.trim().length < 1) {
    missing.push('a username');
  }
  if (!editing && form.secret.length < MIN_SECRET_LENGTH) {
    missing.push(`a password of at least ${MIN_SECRET_LENGTH} characters`);
  }
  return missing;
}

export function createAccountBody(form: AccountForm) {
  return {
    environment: form.environment,
    environmentId: form.environmentId || undefined,
    label: form.label.trim(),
    username: form.username.trim(),
    secret: form.secret,
    notes: form.notes.trim() || undefined,
    rotationPolicy: form.rotationPolicy,
  };
}

/**
 * An edit never carries a password or the environment kind: a password changes by rotating, which
 * revokes the grants handed out against the old one, and the kind is fixed once the login exists.
 */
export function updateAccountBody(form: AccountForm) {
  return {
    environmentId: form.environmentId || undefined,
    label: form.label.trim(),
    username: form.username.trim(),
    notes: form.notes.trim(),
    rotationPolicy: form.rotationPolicy,
    isActive: form.isActive,
  };
}
