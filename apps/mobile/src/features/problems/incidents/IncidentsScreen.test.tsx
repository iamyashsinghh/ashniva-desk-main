import { EMERGENCY_FIX_STATUS, PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../../shared/testing/harness';
import { incidentDetail, routeByPath, sentBody } from '../problem-test-data';
import { IncidentsScreen } from './IncidentsScreen';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();

const RESPONDER = sessionUser({
  roleKey: ROLE_KEYS.TEAM_LEAD,
  permissions: [PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_MANAGE],
});
const READER = sessionUser({
  roleKey: ROLE_KEYS.DEVELOPER,
  permissions: [PERMISSIONS.INCIDENT_READ],
});

const PAGE = {
  items: [incidentDetail({ emergencyFixStatus: EMERGENCY_FIX_STATUS.REQUESTED })],
  nextCursor: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: RESPONDER });
});

describe('the incidents list', () => {
  it('opens on what is still live, with how long it has gone on', async () => {
    fetchMock.mockImplementation(routeByPath({ '/incidents': PAGE }));
    const view = await renderScreen(<IncidentsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('Payments failing for every client')).toBeTruthy();
    expect(view.getByText(/Going for 1 h 35 min/)).toBeTruthy();
    expect(view.getByText('Emergency fix waiting for approval')).toBeTruthy();
    expect(
      requestedPaths(fetchMock).some((path) =>
        decodeURIComponent(path).includes('status=OPEN,INVESTIGATING,IDENTIFIED,MONITORING'),
      ),
    ).toBe(true);
  });

  it('asks for the ended ones when that view is chosen', async () => {
    fetchMock.mockImplementation(routeByPath({ '/incidents': PAGE }));
    const view = await renderScreen(<IncidentsScreen onOpen={jest.fn()} />);
    await view.findByText('Payments failing for every client');

    await fireEvent.press(view.getByText('Resolved'));
    await waitFor(() =>
      expect(
        requestedPaths(fetchMock).some((path) =>
          decodeURIComponent(path).includes('status=RESOLVED,CLOSED'),
        ),
      ).toBe(true),
    );
  });

  it('says nothing is broken when the live view is empty', async () => {
    fetchMock.mockImplementation(routeByPath({ '/incidents': { items: [], nextCursor: null } }));
    const view = await renderScreen(<IncidentsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('Nothing is broken right now.')).toBeTruthy();
  });
});

describe('declaring an incident', () => {
  it('is not offered without incident:manage', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    fetchMock.mockImplementation(routeByPath({ '/incidents': PAGE }));
    const view = await renderScreen(<IncidentsScreen onOpen={jest.fn()} />);

    await view.findByText('Payments failing for every client');
    expect(view.queryByRole('button', { name: 'Declare incident' })).toBeNull();
  });

  it('posts what was written and opens the new incident', async () => {
    fetchMock.mockImplementation(
      routeByPath({ 'POST /incidents': incidentDetail({ id: 'i9' }), '/incidents': PAGE }),
    );
    const onOpen = jest.fn();
    const view = await renderScreen(<IncidentsScreen onOpen={onOpen} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Declare incident' }));
    await fireEvent.changeText(view.getByLabelText('Title'), 'Login loops');
    await fireEvent.changeText(view.getByLabelText('What is broken'), 'Every login redirects back');
    await fireEvent.press(view.getByRole('button', { name: 'Declare' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('i9'));
    expect(sentBody(fetchMock, '/incidents', 'POST')).toEqual({
      title: 'Login loops',
      description: 'Every login redirects back',
      severity: 'HIGH',
    });
  });
});
