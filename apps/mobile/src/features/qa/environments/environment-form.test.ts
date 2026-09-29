import { TEST_ENVIRONMENT, TEST_ENVIRONMENT_STATUS } from '@ashniva/types';

import { environmentBody, initialEnvironmentForm, isEnvironmentValid } from './environment-form';

describe('an environment form', () => {
  it('needs the URL a tester actually opens', () => {
    expect(isEnvironmentValid(initialEnvironmentForm())).toBe(false);
    expect(isEnvironmentValid({ ...initialEnvironmentForm(), url: 'https://x.test' })).toBe(true);
  });

  it('sends the kind only when recording one, and leaves blank details out', () => {
    const form = { ...initialEnvironmentForm(), url: ' https://staging.acme.test ' };
    expect(environmentBody(form, false)).toEqual({
      kind: TEST_ENVIRONMENT.STAGING,
      url: 'https://staging.acme.test',
      status: TEST_ENVIRONMENT_STATUS.UNKNOWN,
      deployedVersion: undefined,
      deployedAt: undefined,
      githubEnvironmentName: undefined,
    });
    expect(environmentBody(form, true)).not.toHaveProperty('kind');
  });
});
