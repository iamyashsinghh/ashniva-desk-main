import { PERMISSIONS, type SlaPolicySummary } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { SlaPoliciesScreen } from './SlaPoliciesScreen';

/**
 * SLA policies: the list, the form's round trip to minutes, and deletion. Everything is behind
 * `sla:manage`, so without it nothing is fetched at all.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const POLICY: SlaPolicySummary = {
  id: '5f0b2a64-7d4c-4f4e-9a7a-1d2e3f4a5b6c',
  name: 'Standard support',
  description: null,
  isDefault: true,
  timezone: 'Asia/Kolkata',
  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
  businessDays: [1, 2, 3, 4, 5],
  pauseStatuses: ['WAITING_CLIENT'],
  warningPercent: 80,
  rules: [
    { priority: 'CRITICAL', firstResponseMinutes: 60, resolutionMinutes: 240 },
    { priority: 'HIGH', firstResponseMinutes: 120, resolutionMinutes: 480 },
    { priority: 'MEDIUM', firstResponseMinutes: 240, resolutionMinutes: 1440 },
    { priority: 'LOW', firstResponseMinutes: 480, resolutionMinutes: 2400 },
  ],
  clientOrganization: null,
  project: null,
  ticketCount: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      'GET /sla/policies': [POLICY],
      [`PATCH /sla/policies/${POLICY.id}`]: {
        ...POLICY,
        reapply: { changed: 3, truncated: false },
      },
      [`DELETE /sla/policies/${POLICY.id}`]: undefined,
      'GET /organizations/options': [],
      'GET /projects': [],
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('asks for nothing without sla:manage', async () => {
  signInWith([PERMISSIONS.TICKET_READ]);
  const view = await renderScreen(<SlaPoliciesScreen />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(wasSent(fetchMock, 'GET', '/sla/policies')).toBe(false);
});

it('shows each policy with its scope, hours and targets', async () => {
  signInWith([PERMISSIONS.SLA_MANAGE]);
  const view = await renderScreen(<SlaPoliciesScreen />);

  expect(await view.findByText('Standard support')).toBeTruthy();
  expect(view.getByLabelText('Status: Default')).toBeTruthy();
  expect(view.getByText('09:00–18:00 Asia/Kolkata · Mon, Tue, Wed, Thu, Fri')).toBeTruthy();
  expect(view.getByText('1h reply · 4h resolve')).toBeTruthy();
});

it('saves an edit in minutes and says how many tickets were re-timed', async () => {
  signInWith([PERMISSIONS.SLA_MANAGE]);
  const view = await renderScreen(<SlaPoliciesScreen />);
  await view.findByText('Standard support');

  await fireEvent.press(view.getByRole('button', { name: 'Edit' }));
  await fireEvent.changeText(view.getByLabelText('Critical first response hours'), '0.5');
  await fireEvent.press(view.getByRole('button', { name: 'Save and re-apply' }));

  expect(await view.findByText('“Standard support” saved. 3 open tickets re-timed.')).toBeTruthy();
  const body = sentBody(fetchMock, 'PATCH', `/sla/policies/${POLICY.id}`) as {
    isDefault: boolean;
    rules: { priority: string; firstResponseMinutes: number }[];
  };
  expect(body.isDefault).toBe(true);
  expect(body.rules.find((rule) => rule.priority === 'CRITICAL')).toEqual({
    priority: 'CRITICAL',
    firstResponseMinutes: 30,
    resolutionMinutes: 240,
  });
});

it('deletes a policy after confirming', async () => {
  signInWith([PERMISSIONS.SLA_MANAGE]);
  const view = await renderScreen(<SlaPoliciesScreen />);
  await view.findByText('Standard support');

  await fireEvent.press(view.getByRole('button', { name: 'Delete' }));
  expect(view.getByText(/its 3 open tickets fall back/)).toBeTruthy();
  const confirms = view.getAllByRole('button', { name: 'Delete' });
  await fireEvent.press(confirms[confirms.length - 1]!);

  await waitFor(() =>
    expect(wasSent(fetchMock, 'DELETE', `/sla/policies/${POLICY.id}`)).toBe(true),
  );
});
