import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { InternWorkFormScreen } from './InternWorkFormScreen';
import { DIRECTORY, internTask, routeRequests } from './intern-work-test-data';

/**
 * Assigning intern work.
 *
 * An incomplete form is not sent; a complete one is sent as learning work that is never
 * client-visible; and somebody the web would not let assign sees why rather than a form.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function posts() {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === 'POST',
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    routeRequests({
      'POST /tasks': { ...internTask({ id: 'task-9' }) },
      '/users/directory': DIRECTORY,
      '/projects': [],
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.TEAM_LEAD,
      permissions: [PERMISSIONS.TASK_READ, PERMISSIONS.TASK_ASSIGN],
    }),
  });
});

it('says what is missing instead of sending an incomplete assignment', async () => {
  const view = await renderScreen(<InternWorkFormScreen onDone={jest.fn()} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Assign work' }));

  expect(await view.findByText('Give the work a clear title')).toBeTruthy();
  expect(view.getByText('Choose an intern')).toBeTruthy();
  expect(posts()).toHaveLength(0);
});

it('offers only interns and sends learning work, then opens it', async () => {
  const onOpenTask = jest.fn();
  const view = await renderScreen(
    <InternWorkFormScreen onDone={jest.fn()} onOpenTask={onOpenTask} />,
  );

  await fireEvent.changeText(await view.findByLabelText('Title'), 'Build a todo app');
  await fireEvent.press(view.getByRole('button', { name: 'Intern: not set' }));
  expect(view.queryByRole('radio', { name: /Asha Dev/ })).toBeNull();
  await fireEvent.press(await view.findByRole('radio', { name: /Ivy Intern/ }));
  await fireEvent.press(view.getByRole('button', { name: 'Assign work' }));

  await waitFor(() => expect(onOpenTask).toHaveBeenCalledWith('task-9'));
  const [post] = posts();
  expect(String(post?.[0])).toContain('/tasks');
  const body = JSON.parse(String((post?.[1] as { body: string }).body)) as Record<string, unknown>;
  expect(body).toMatchObject({
    title: 'Build a todo app',
    assignedToId: 'intern-1',
    isInternTask: true,
    clientVisible: false,
    priority: 'MEDIUM',
  });
});

it('closes when there is no task to open', async () => {
  const onDone = jest.fn();
  const view = await renderScreen(<InternWorkFormScreen onDone={onDone} />);

  await fireEvent.changeText(await view.findByLabelText('Title'), 'Read the style guide');
  await fireEvent.press(view.getByRole('button', { name: 'Intern: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: /Ivy Intern/ }));
  await fireEvent.press(view.getByRole('button', { name: 'Assign work' }));

  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

it('explains the rule to somebody who may not assign', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.DEVELOPER, permissions: [PERMISSIONS.TASK_ASSIGN] }),
  });
  const onDone = jest.fn();
  const view = await renderScreen(<InternWorkFormScreen onDone={onDone} />);

  expect(
    await view.findByText(
      'Only a director, project manager or team lead can assign work to interns.',
    ),
  ).toBeTruthy();
  expect(view.queryByLabelText('Title')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Back' }));
  expect(onDone).toHaveBeenCalled();
});
