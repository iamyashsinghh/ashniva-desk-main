import {
  PERMISSIONS,
  PRIORITY,
  PROBLEM_STATUS,
  ROLE_KEYS,
  type RecurringReport,
} from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { problemDetail, routeByPath, sentBody } from './problem-test-data';
import { RecurringIssuesScreen } from './RecurringIssuesScreen';

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [PERMISSIONS.PROBLEM_READ, PERMISSIONS.PROBLEM_MANAGE],
});
const READER = sessionUser({
  roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
  permissions: [PERMISSIONS.PROBLEM_READ],
});

const REPORT: RecurringReport = {
  groupBy: 'module',
  windowDays: 30,
  threshold: 3,
  generatedAt: '2026-09-29T09:00:00.000Z',
  rows: [
    {
      label: 'Checkout',
      productId: 'pr1',
      module: 'Checkout',
      productVersion: null,
      severity: PRIORITY.HIGH,
      ticketCount: 9,
      clientCount: 4,
      problems: [],
      overThreshold: true,
    },
    {
      label: 'Invoices',
      productId: 'pr1',
      module: 'Invoices',
      productVersion: null,
      severity: null,
      ticketCount: 2,
      clientCount: 1,
      problems: [{ id: 'p3', key: 'PRB-3', status: PROBLEM_STATUS.RCA_REQUESTED }],
      overThreshold: false,
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
});

describe('recurring issues', () => {
  it('lists each group with its separate clients and the threshold', async () => {
    fetchMock.mockImplementation(routeByPath({ '/reports/recurring': REPORT }));
    const view = await renderScreen(<RecurringIssuesScreen onOpenProblem={jest.fn()} />);

    expect(await view.findByText('Checkout')).toBeTruthy();
    expect(view.getByText('4 clients')).toBeTruthy();
    expect(view.getByText('Over threshold')).toBeTruthy();
    expect(
      view.getByText('Client counts are separate companies, never tickets · threshold 3'),
    ).toBeTruthy();
  });

  it('regroups through the API', async () => {
    fetchMock.mockImplementation(routeByPath({ '/reports/recurring': REPORT }));
    const view = await renderScreen(<RecurringIssuesScreen onOpenProblem={jest.fn()} />);
    await view.findByText('Checkout');

    await fireEvent.press(view.getByRole('tab', { name: 'Product' }));
    await waitFor(() =>
      expect(requestedPaths(fetchMock).some((path) => path.includes('by=product'))).toBe(true),
    );
  });

  it('opens a problem already filed for a group', async () => {
    fetchMock.mockImplementation(routeByPath({ '/reports/recurring': REPORT }));
    const onOpenProblem = jest.fn();
    const view = await renderScreen(<RecurringIssuesScreen onOpenProblem={onOpenProblem} />);

    await fireEvent.press(await view.findByText('PRB-3'));
    expect(onOpenProblem).toHaveBeenCalledWith('p3');
  });

  it('promotes a group into a problem, carrying its module and product', async () => {
    fetchMock.mockImplementation(
      routeByPath({
        'POST /problems': problemDetail({ id: 'p9' }),
        '/reports/recurring': REPORT,
      }),
    );
    const onOpenProblem = jest.fn();
    const view = await renderScreen(<RecurringIssuesScreen onOpenProblem={onOpenProblem} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Open a problem' }));
    await fireEvent.press(view.getByRole('button', { name: 'Open problem' }));

    await waitFor(() => expect(onOpenProblem).toHaveBeenCalledWith('p9'));
    expect(sentBody(fetchMock, '/problems', 'POST')).toMatchObject({
      title: 'Checkout',
      module: 'Checkout',
      productId: 'pr1',
      severity: 'HIGH',
    });
  });

  it('does not offer promotion without problem:manage', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    fetchMock.mockImplementation(routeByPath({ '/reports/recurring': REPORT }));
    const view = await renderScreen(<RecurringIssuesScreen onOpenProblem={jest.fn()} />);

    await view.findByText('Checkout');
    expect(view.queryByRole('button', { name: 'Open a problem' })).toBeNull();
  });
});
