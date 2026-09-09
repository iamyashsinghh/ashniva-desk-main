import { PERMISSIONS, ROLE_KEYS, UAT_DECISION, type UatRequestDetail } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { SignOffScreen } from './SignOffScreen';

/**
 * The client's sign-off screen.
 *
 * The split between reading and answering is what this proves. Anybody at the client may open a
 * request and ask a question about it; only somebody holding `uat:decide` sees the answer form,
 * because the route behind it requires that permission and a form that always answers 403 is
 * worse than no form.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const clientOrganization = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Northwind',
  slug: 'northwind',
  isServiceProvider: false,
};

const DECIDER = sessionUser({
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  roleName: 'Client Admin',
  permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.UAT_DECIDE],
  organization: clientOrganization,
});

const READER = sessionUser({
  roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
  roleName: 'Client Employee',
  permissions: [PERMISSIONS.PROJECT_READ],
  organization: clientOrganization,
});

function request(overrides: Partial<UatRequestDetail> = {}): UatRequestDetail {
  return {
    id: 'u1',
    releaseId: null,
    taskId: 't1',
    summaryPlain: 'The booking form now sends a confirmation email.',
    previewUrl: null,
    checklist: ['Make a booking', 'Check the email arrives'],
    status: UAT_DECISION.PENDING,
    note: null,
    decidedAt: null,
    decidedByName: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    clientOrganizationId: clientOrganization.id,
    clientName: 'Northwind',
    releaseVersion: null,
    createdByName: 'Priya Rao',
    comments: [],
    updatedAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('somebody who may sign off', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: DECIDER }));

  it('shows what changed and the numbered list of what to check', async () => {
    fetchMock.mockResolvedValue(jsonResponse(request()));
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    expect(await view.findByText('The booking form now sends a confirmation email.')).toBeTruthy();
    expect(await view.findByText('1. Make a booking')).toBeTruthy();
    expect(await view.findByText('2. Check the email arrives')).toBeTruthy();
  });

  it('sends the approval to the decide route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(request()));
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Sign it off' }));

    expect(requestedPaths(fetchMock).some((path) => path.endsWith('/portal/uat/u1/decide'))).toBe(
      true,
    );
  });

  it('will not ask for changes without saying what is wrong', async () => {
    fetchMock.mockResolvedValue(jsonResponse(request()));
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    await fireEvent.press(await view.findByRole('tab', { name: 'Not yet' }));
    const button = await view.findByRole('button', { name: 'Ask for changes' });
    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(button);
    expect(requestedPaths(fetchMock).some((path) => path.includes('/decide'))).toBe(false);
  });
});

describe('somebody who may only read it', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: READER }));

  it('says who has to answer, and still lets them ask a question', async () => {
    fetchMock.mockResolvedValue(jsonResponse(request()));
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    expect(view.queryByRole('button', { name: 'Sign it off' })).toBeNull();
    expect(
      await view.findByText(
        'Somebody with sign-off rights at your organization has to answer this one. You can still ask a question below.',
      ),
    ).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Send the question' })).toBeTruthy();
  });
});

describe('a request that has been answered', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: DECIDER }));

  it('shows the answer instead of the form', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        request({
          status: UAT_DECISION.APPROVED,
          decidedByName: 'Alex Bell',
          decidedAt: '2026-09-02T10:00:00.000Z',
          note: 'Works for us.',
        }),
      ),
    );
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    expect(await view.findByText('Works for us.')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Sign it off' })).toBeNull();
  });
});

describe('when the API refuses the read', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: READER }));

  it('shows the API’s own sentence and a retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Sign-off not found' }, 404));
    const view = await renderScreen(<SignOffScreen requestId="u1" />);

    expect(await view.findByText('Sign-off not found')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
