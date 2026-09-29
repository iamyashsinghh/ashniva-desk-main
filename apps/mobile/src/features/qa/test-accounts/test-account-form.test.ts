import {
  CREDENTIAL_ROTATION_POLICY,
  TEST_ENVIRONMENT,
  type TestAccountSummary,
} from '@ashniva/types';

import {
  createAccountBody,
  initialAccountForm,
  missingAccountFields,
  updateAccountBody,
} from './test-account-form';

const EXISTING: TestAccountSummary = {
  id: 'ta1',
  projectId: 'p1',
  environment: TEST_ENVIRONMENT.STAGING,
  environmentId: null,
  label: 'Test Admin',
  username: 'admin@test',
  notes: null,
  rotationPolicy: CREDENTIAL_ROTATION_POLICY.DAILY,
  isActive: true,
  rotatedAt: null,
  hasActiveGrant: false,
  createdAt: '2026-09-01T09:00:00.000Z',
};

describe('a test login form', () => {
  it('needs a password of at least eight characters only when recording a new one', () => {
    const fresh = { ...initialAccountForm(), label: 'QA', username: 'qa', secret: 'short' };
    expect(missingAccountFields(fresh, false)).toEqual(['a password of at least 8 characters']);
    expect(missingAccountFields(initialAccountForm(EXISTING), true)).toEqual([]);
  });

  it('never sends a password or the environment kind with an edit', () => {
    const body = updateAccountBody({ ...initialAccountForm(EXISTING), secret: 'should-not-go' });
    expect(body).not.toHaveProperty('secret');
    expect(body).not.toHaveProperty('environment');
    expect(body).toMatchObject({ label: 'Test Admin', isActive: true, environmentId: undefined });
  });

  it('sends the password and trims the rest when recording one', () => {
    expect(
      createAccountBody({
        ...initialAccountForm(),
        label: ' QA ',
        username: ' qa ',
        secret: 'correct horse',
        notes: '  ',
      }),
    ).toEqual({
      environment: TEST_ENVIRONMENT.STAGING,
      environmentId: undefined,
      label: 'QA',
      username: 'qa',
      secret: 'correct horse',
      notes: undefined,
      rotationPolicy: CREDENTIAL_ROTATION_POLICY.AFTER_TEST,
    });
  });
});
