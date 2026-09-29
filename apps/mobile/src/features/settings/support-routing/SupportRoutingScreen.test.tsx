import { PERMISSIONS, type ProjectSummary } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { CONFIG } from '../../support-queue/support-test-data';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { SupportRoutingScreen } from './SupportRoutingScreen';

/**
 * Support routing configuration: the ownership chain for the chosen project, saved whole, with the
 * team and on-call views reused from the queue.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const PROJECT = { id: 'p1', code: 'ASH', name: 'Ashniva portal' } as ProjectSummary;

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      'GET /projects': [PROJECT],
      'GET /projects/p1/support-config': CONFIG,
      'PUT /projects/p1/support-ownership': CONFIG.ownership,
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('asks for nothing without support-routing:manage', async () => {
  signInWith([PERMISSIONS.TICKET_READ]);
  const view = await renderScreen(<SupportRoutingScreen />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(wasSent(fetchMock, 'GET', '/projects')).toBe(false);
});

it('shows the first active project’s chain and module owners', async () => {
  signInWith([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
  const view = await renderScreen(<SupportRoutingScreen />);

  expect(await view.findByText('Support ownership')).toBeTruthy();
  expect(view.getByLabelText('Status: Routing automatically')).toBeTruthy();
  expect(view.getByText('Billing')).toBeTruthy();
  expect(view.getAllByText('Asha Rao').length).toBeGreaterThan(0);
});

it('saves the ownership with blank module rows dropped', async () => {
  signInWith([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
  const view = await renderScreen(<SupportRoutingScreen />);
  await view.findByText('Support ownership');

  await fireEvent.press(view.getByRole('button', { name: 'Edit' }));
  await fireEvent.press(view.getByRole('button', { name: 'Add work area' }));
  await fireEvent.changeText(view.getByLabelText('Acknowledge within minutes'), '15');
  await fireEvent.press(view.getByRole('button', { name: 'Save ownership' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PUT', '/projects/p1/support-ownership')).toMatchObject({
      primaryDeveloperId: 'u1',
      moduleOwners: { Billing: 'u1' },
      ackMinutes: 15,
      workloadLimit: null,
      autoRouteEnabled: true,
    }),
  );
  expect(await view.findByText('Support ownership saved.')).toBeTruthy();
});

it('lists the team with their routing state', async () => {
  signInWith([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
  const view = await renderScreen(<SupportRoutingScreen />);
  await view.findByText('Support ownership');

  await fireEvent.press(view.getByRole('tab', { name: 'Team' }));
  expect(await view.findByText('No working hours configured')).toBeTruthy();
});
