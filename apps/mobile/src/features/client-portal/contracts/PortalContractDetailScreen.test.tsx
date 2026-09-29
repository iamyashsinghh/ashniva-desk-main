import { ROLE_KEYS, PERMISSIONS } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../../shared/testing/harness';
import { PortalContractDetailScreen } from './PortalContractDetailScreen';

/** A contract as the client reads it: the hours left, where they went, and the project link. */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();

const CONTRACT = {
  id: 'c1',
  number: 'CON-7',
  title: 'Annual support',
  type: 'SUPPORT',
  status: 'ACTIVE',
  project: { id: 'p1', code: 'WEB', name: 'Website rebuild' },
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  renewalDate: '2026-12-01',
  isExpiringSoon: false,
  tracksHours: true,
  hours: {
    includedMinutes: 600,
    purchasedMinutes: 0,
    carriedForwardMinutes: 0,
    consumedMinutes: 540,
    reservedMinutes: 0,
    adjustmentMinutes: 0,
    expiredMinutes: 0,
    remainingMinutes: 60,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    isLow: true,
  },
  scope: 'Bug fixes and small changes.',
  clientNotes: null,
  milestones: [],
  documents: [],
  recentLedger: [
    {
      id: 'l1',
      kind: 'CONSUMED',
      minutes: -120,
      balanceAfterMinutes: 60,
      periodStart: '2026-09-01',
      periodEnd: null,
      reason: null,
      task: null,
      ticket: { id: 't1', number: 42, title: 'Login fails' },
      workLogId: null,
      createdBy: null,
      createdAt: '2026-09-20T09:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.CLIENT_ADMIN,
      roleName: 'Client Admin',
      permissions: [PERMISSIONS.CONTRACT_READ],
    }),
  });
  fetchMock.mockResolvedValue(jsonResponse(CONTRACT));
});

it('shows the support hours left, that they are running low, and what used them', async () => {
  const view = await renderScreen(<PortalContractDetailScreen contractId="c1" />);

  expect(await view.findByText('Annual support')).toBeTruthy();
  expect(requestedPaths(fetchMock)[0]).toContain('/portal/contracts/c1');
  expect(view.getByText('Support hours this period')).toBeTruthy();
  expect(view.getAllByText('Running low').length).toBeGreaterThan(0);
  expect(view.getByText('T-42 Login fails')).toBeTruthy();
});

it('opens the contract’s project', async () => {
  const onOpenProject = jest.fn();
  const view = await renderScreen(
    <PortalContractDetailScreen contractId="c1" onOpenProject={onOpenProject} />,
  );

  await fireEvent.press(await view.findByRole('button', { name: /Website rebuild/ }));

  expect(onOpenProject).toHaveBeenCalledWith('p1');
});
