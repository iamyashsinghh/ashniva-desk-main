import { PERMISSIONS, ROLE_KEYS, type PermissionKey, type TaskSummary } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { ProjectDetailScreen } from './ProjectDetailScreen';
import { projectDetail, routeByPath } from './project-test-data';

/**
 * One project: its header actions and its tabs.
 *
 * The actions are the web's — Summary, New task, Edit, Edit team — and each is drawn only for a
 * person the API would let through. A tab's list is asked for only once the tab is opened, and a
 * tab for data this person may not read does not exist.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const TASK = {
  id: 't1',
  key: 'ACM-7',
  title: 'Wire the login page',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  assignedTo: { id: 'dev-1', name: 'Asha Dev', email: 'asha@example.com' },
  dueDate: '2026-10-01',
  isOverdue: false,
} as unknown as TaskSummary;

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.PROJECT_MANAGER, permissions }),
  });
}

const callbacks = () => ({
  onOpenChat: null,
  onOpenSummary: jest.fn(),
  onCreateTask: jest.fn(),
  onEdit: jest.fn(),
  onEditMembers: jest.fn(),
  onOpenTask: jest.fn(),
  onOpenTicket: jest.fn(),
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    routeByPath({
      '/tasks': { items: [TASK], nextCursor: null },
      '/projects/p1': projectDetail(),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('the header', () => {
  it('offers every action to a project manager', async () => {
    signIn([
      PERMISSIONS.PROJECT_READ,
      PERMISSIONS.PROJECT_MANAGE,
      PERMISSIONS.TASK_READ,
      PERMISSIONS.TASK_CREATE,
    ]);
    const props = callbacks();
    const view = await renderScreen(<ProjectDetailScreen projectId="p1" {...props} />);
    await view.findByText('Acme portal');

    await fireEvent.press(view.getByRole('button', { name: 'Summary' }));
    await fireEvent.press(view.getByRole('button', { name: 'New task' }));
    await fireEvent.press(view.getByRole('button', { name: 'Edit' }));
    expect(props.onOpenSummary).toHaveBeenCalledWith('p1');
    expect(props.onCreateTask).toHaveBeenCalledWith('p1');
    expect(props.onEdit).toHaveBeenCalledWith('p1');
  });

  it('leaves out what a reader may not do', async () => {
    signIn([PERMISSIONS.PROJECT_READ]);
    const view = await renderScreen(<ProjectDetailScreen projectId="p1" {...callbacks()} />);
    await view.findByText('Acme portal');

    expect(view.getByRole('button', { name: 'Summary' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
    // No task:read, no ticket:read: those tabs are not there to open.
    expect(view.queryByRole('tab', { name: /^Tasks/ })).toBeNull();
    expect(view.queryByRole('tab', { name: /^Tickets/ })).toBeNull();
  });
});

describe('the tabs', () => {
  it('asks for the project’s tasks only when the tab is opened, and opens one', async () => {
    signIn([PERMISSIONS.PROJECT_READ, PERMISSIONS.TASK_READ]);
    const props = callbacks();
    const view = await renderScreen(<ProjectDetailScreen projectId="p1" {...props} />);
    await view.findByText('Acme portal');
    expect(requestedPaths(fetchMock).some((path) => path.includes('/tasks'))).toBe(false);

    await fireEvent.press(view.getByRole('tab', { name: 'Tasks, 10' }));
    await fireEvent.press(await view.findByRole('button', { name: 'ACM-7 Wire the login page' }));

    const path = requestedPaths(fetchMock).find((candidate) => candidate.includes('/tasks'));
    expect(path).toContain('view=all');
    expect(path).toContain('projectId=p1');
    expect(props.onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('lists members, with "Edit team" only for someone who may change it', async () => {
    signIn([PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_MANAGE]);
    const props = callbacks();
    const view = await renderScreen(<ProjectDetailScreen projectId="p1" {...props} />);
    await view.findByText('Acme portal');

    await fireEvent.press(view.getByRole('tab', { name: 'Members, 2' }));
    expect(await view.findByText('Asha Dev')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Edit team' }));
    expect(props.onEditMembers).toHaveBeenCalledWith('p1');
  });

  it('shows the API’s sentence when the project cannot be read', async () => {
    signIn([PERMISSIONS.PROJECT_READ]);
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Project not found' }, 404));
    const view = await renderScreen(<ProjectDetailScreen projectId="p1" {...callbacks()} />);
    await waitFor(() => expect(view.getByText('Project not found')).toBeTruthy());
  });
});
