import {
  CHANGED_PASSWORD_MIN,
  NEW_ACCOUNT_PASSWORD_MIN,
  PASSWORD_MAX,
  passwordProblem,
} from './password-rules';

describe('passwordProblem', () => {
  it('holds a reset or invitation password to the API minimum of 12', () => {
    expect(passwordProblem('a'.repeat(11), 'a'.repeat(11), NEW_ACCOUNT_PASSWORD_MIN)).toBe(
      'At least 12 characters',
    );
    expect(passwordProblem('a'.repeat(12), 'a'.repeat(12), NEW_ACCOUNT_PASSWORD_MIN)).toBeNull();
  });

  it('holds a changed password to the API minimum of 10', () => {
    expect(passwordProblem('a'.repeat(10), 'a'.repeat(10), CHANGED_PASSWORD_MIN)).toBeNull();
  });

  it('refuses a mismatched confirmation', () => {
    expect(passwordProblem('a-long-password', 'a-long-passwort', 10)).toBe(
      'The two passwords do not match',
    );
  });

  it('refuses a password longer than the API accepts', () => {
    const long = 'a'.repeat(PASSWORD_MAX + 1);
    expect(passwordProblem(long, long, 10)).toBe(`No more than ${PASSWORD_MAX} characters`);
  });
});
