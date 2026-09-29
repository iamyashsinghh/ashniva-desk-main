import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { milestoneDetail, routeFetch, sentRequest } from '../contracts/commercial-test-data';
import { MilestoneDetailScreen } from './MilestoneDetailScreen';

/**
 * One milestone. Status, progress and editing are `milestone:manage`; ticking a deliverable is
 * `task:work`; the status buttons are the shared workflow's transitions from where it stands.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

function signInWith(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.PROJECT_MANAGER,
      permissions: [PERMISSIONS.PROJECT_READ, ...permissions],
    }),
  });
}

const navigation = {
  onEdit: jest.fn(),
  onOpenTask: jest.fn(),
  onOpenApproval: jest.fn(),
  onOpenProject: jest.fn(),
  onOpenContract: jest.fn(),
  onOpenChangeRequest: jest.fn(),
  onOpenMilestone: jest.fn(),
};

function render() {
  return renderScreen(<MilestoneDetailScreen milestoneId="ms-1" {...navigation} />);
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('draws the status buttons disabled, with the reason, for somebody who may not move it', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /milestones/ms-1': milestoneDetail() });
  const view = await render();

  expect(await view.findByText('Checkout redesign')).toBeTruthy();
  expect(view.getByText('Only managers move milestones.')).toBeTruthy();
  const complete = view.getByRole('button', { name: 'Completed' });
  expect(complete.props.accessibilityState.disabled).toBe(true);
  expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Adjust progress' })).toBeNull();
  expect(view.getByRole('switch', { name: 'Wireframes' }).props.disabled).toBe(true);
});

it('moves an in-progress milestone to completed for a manager', async () => {
  signInWith([PERMISSIONS.MILESTONE_MANAGE]);
  routeFetch(fetchMock, {
    'POST /milestones/ms-1/status': milestoneDetail({ status: 'COMPLETED' }),
    'GET /milestones/ms-1': milestoneDetail(),
  });
  const view = await render();

  expect(view.queryByText('Planned')).toBeNull();
  await fireEvent.press(await view.findByRole('button', { name: 'Completed' }));
  await waitFor(() =>
    expect(sentRequest(fetchMock, '/milestones/ms-1/status', 'POST')?.body).toEqual({
      status: 'COMPLETED',
    }),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Edit' }));
  expect(navigation.onEdit).toHaveBeenCalledWith('ms-1');
});

it('lets somebody doing the work tick a deliverable', async () => {
  signInWith([PERMISSIONS.TASK_WORK]);
  routeFetch(fetchMock, {
    'PATCH /milestones/ms-1/deliverables/dl-1': milestoneDetail(),
    'GET /milestones/ms-1': milestoneDetail(),
  });
  const view = await render();

  await fireEvent(await view.findByRole('switch', { name: 'Wireframes' }), 'valueChange', true);
  await waitFor(() =>
    expect(sentRequest(fetchMock, '/milestones/ms-1/deliverables/dl-1', 'PATCH')?.body).toEqual({
      isDone: true,
    }),
  );
});

it('overrides progress only with a reason', async () => {
  signInWith([PERMISSIONS.MILESTONE_MANAGE]);
  routeFetch(fetchMock, {
    'POST /milestones/ms-1/progress': milestoneDetail({ progressMode: 'MANUAL' }),
    'GET /milestones/ms-1': milestoneDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Adjust progress' }));
  await fireEvent.changeText(view.getByLabelText('Progress (%)'), '75');
  expect(view.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(view.getByLabelText('Reason'), 'Design signed off early');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(sentRequest(fetchMock, '/milestones/ms-1/progress', 'POST')?.body).toEqual({
      progressPercent: 75,
      reason: 'Design signed off early',
    }),
  );
});
