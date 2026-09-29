import { PERMISSIONS, PROBLEM_STATUS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { ProblemDetailScreen } from './ProblemDetailScreen';
import { problemDetail, routeByPath, sentBody } from './problem-test-data';

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [
    PERMISSIONS.PROBLEM_READ,
    PERMISSIONS.PROBLEM_MANAGE,
    PERMISSIONS.TICKET_READ,
    PERMISSIONS.TASK_READ,
  ],
});
const READER = sessionUser({
  roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
  permissions: [PERMISSIONS.PROBLEM_READ, PERMISSIONS.TICKET_READ],
});

function serve(problem = problemDetail()) {
  fetchMock.mockImplementation(routeByPath({ '/problems/p1': problem }));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
});

describe('a problem', () => {
  it('names the clients that reported it, marked internal', async () => {
    serve();
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    expect(await view.findByText('Checkout times out on large carts')).toBeTruthy();
    expect(view.getByText(/Northwind · 3\.2\.0/)).toBeTruthy();
    expect(view.getByText('Internal — each client sees only their own ticket.')).toBeTruthy();
    expect(view.getByText(/^Reported by 3 clients using version 3\.2\.0/)).toBeTruthy();
  });

  it('opens a linked ticket', async () => {
    serve();
    const onOpenTicket = jest.fn();
    const view = await renderScreen(
      <ProblemDetailScreen problemId="p1" onOpenTicket={onOpenTicket} />,
    );

    await fireEvent.press(await view.findByText('AD-127 · Cannot pay for a big order'));
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
  });

  it('prints the server’s reason Close is off, and offers Close greyed', async () => {
    serve();
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    expect(await view.findByText('The root-cause analysis has not been approved.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'More actions' }));
    expect(view.getByText('Close problem')).toBeTruthy();
    expect(view.getAllByText('The root-cause analysis has not been approved.').length).toBe(2);
  });
});

describe('asking for the analysis', () => {
  it('posts to request-rca with the note that was written', async () => {
    serve();
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Request RCA' }));
    await fireEvent.changeText(view.getByLabelText('What to look at'), '  Gateway timeouts  ');
    const buttons = view.getAllByRole('button', { name: 'Request RCA' });
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() =>
      expect(sentBody(fetchMock, '/problems/p1/request-rca', 'POST')).toEqual({
        note: 'Gateway timeouts',
      }),
    );
  });

  it('is not offered to somebody who may only read problems', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    serve();
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    await view.findByText('Checkout times out on large carts');
    expect(view.queryByRole('button', { name: 'Request RCA' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Link' })).toBeNull();
  });
});

describe('asking the developer', () => {
  it('is open to a reader, and sends the question', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    serve();
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'More actions' }));
    await fireEvent.press(view.getByText('Ask developer'));
    await fireEvent.changeText(view.getByLabelText('Your question'), 'Which gateway?');
    await fireEvent.press(view.getByRole('button', { name: 'Ask' }));

    await waitFor(() =>
      expect(sentBody(fetchMock, '/problems/p1/ask-developer', 'POST')).toEqual({
        body: 'Which gateway?',
      }),
    );
  });
});

describe('a closed problem', () => {
  it('offers no actions at all', async () => {
    serve(
      problemDetail({
        status: PROBLEM_STATUS.CLOSED,
        closure: { allowed: true, blockers: [], warnings: [] },
      }),
    );
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    await view.findByText('Checkout times out on large carts');
    expect(view.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});

describe('when the API refuses the read', () => {
  it('shows its sentence and offers a retry', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Problem not found' }),
        headers: { get: () => null },
      }),
    );
    const view = await renderScreen(<ProblemDetailScreen problemId="p1" />);

    expect(await view.findByText('Problem not found')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
