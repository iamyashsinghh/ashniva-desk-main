import { EMERGENCY_FIX_STATUS, INCIDENT_STATUS, PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { incidentDetail, routeByPath, sentBody } from '../problem-test-data';
import { IncidentDetailScreen } from './IncidentDetailScreen';

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
  permissions: [PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_MANAGE, PERMISSIONS.PROBLEM_READ],
});
const APPROVER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_APPROVE_EMERGENCY_FIX],
});
const READER = sessionUser({
  roleKey: ROLE_KEYS.DEVELOPER,
  permissions: [PERMISSIONS.INCIDENT_READ],
});

function serve(incident = incidentDetail()) {
  fetchMock.mockImplementation(routeByPath({ '/incidents/i1': incident }));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: RESPONDER });
});

describe('a live incident', () => {
  it('shows what is broken, marked internal, with its timeline', async () => {
    serve();
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    expect(await view.findByText('Payments failing for every client')).toBeTruthy();
    expect(view.getByText('The payment gateway answers 502 to every charge.')).toBeTruthy();
    expect(view.getByText('INC-4 · internal — clients see only a published summary')).toBeTruthy();
    expect(view.getByText('Incident opened')).toBeTruthy();
  });

  it('moves a fresh incident to investigating through PATCH', async () => {
    serve();
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Move to Investigating' }));
    await waitFor(() =>
      expect(sentBody(fetchMock, '/incidents/i1', 'PATCH')).toEqual({ status: 'INVESTIGATING' }),
    );
  });

  it('resolves with what ended the impact', async () => {
    serve(incidentDetail({ status: INCIDENT_STATUS.MONITORING }));
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Resolve' }));
    await fireEvent.changeText(view.getByLabelText('What ended the impact'), 'Rolled back 3.2.1');
    const buttons = view.getAllByRole('button', { name: 'Resolve' });
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() =>
      expect(sentBody(fetchMock, '/incidents/i1/resolve', 'POST')).toEqual({
        resolution: 'Rolled back 3.2.1',
      }),
    );
  });

  it('offers a reader no actions and no way to publish', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    serve();
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await view.findByText('Payments failing for every client');
    expect(view.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Publish to clients' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Request emergency fix' })).toBeNull();
  });
});

describe('the client summary', () => {
  it('publishes the wording that was written', async () => {
    serve();
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await fireEvent.changeText(
      await view.findByLabelText('What clients may be told'),
      '  Card payments are failing; we are on it.  ',
    );
    await fireEvent.press(view.getByRole('button', { name: 'Publish to clients' }));

    await waitFor(() =>
      expect(sentBody(fetchMock, '/incidents/i1/publish-client-summary', 'POST')).toEqual({
        clientSummary: 'Card payments are failing; we are on it.',
      }),
    );
  });
});

describe('the emergency fix', () => {
  it('lets a responder ask, with a reason', async () => {
    serve();
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Request emergency fix' }));
    await fireEvent.changeText(
      view.getByLabelText('Why this cannot wait for the scheduled release'),
      'Every client is losing sales',
    );
    await fireEvent.press(view.getByRole('button', { name: 'Request' }));

    await waitFor(() =>
      expect(sentBody(fetchMock, '/incidents/i1/request-emergency-fix', 'POST')).toEqual({
        reason: 'Every client is losing sales',
      }),
    );
  });

  it('lets only an approver decide a waiting request', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: APPROVER });
    serve(incidentDetail({ emergencyFixStatus: EMERGENCY_FIX_STATUS.REQUESTED }));
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Approve' }));
    await fireEvent.changeText(
      view.getByLabelText(
        'Why, in words. This skips the scheduled release and still owes a production smoke test.',
      ),
      'Revenue outage',
    );
    const buttons = view.getAllByRole('button', { name: 'Approve' });
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() =>
      expect(sentBody(fetchMock, '/incidents/i1/approve-emergency-fix', 'POST')).toEqual({
        decision: 'APPROVED',
        reason: 'Revenue outage',
      }),
    );
  });

  it('does not let the responder approve their own request', async () => {
    serve(incidentDetail({ emergencyFixStatus: EMERGENCY_FIX_STATUS.REQUESTED }));
    const view = await renderScreen(<IncidentDetailScreen incidentId="i1" />);

    await view.findByText('Payments failing for every client');
    expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('the problem behind it', () => {
  it('opens the problem it was declared against', async () => {
    serve(incidentDetail({ problemId: 'p1' }));
    const onOpenProblem = jest.fn();
    const view = await renderScreen(
      <IncidentDetailScreen incidentId="i1" onOpenProblem={onOpenProblem} />,
    );

    await fireEvent.press(await view.findByText('The recurring fault behind it'));
    expect(onOpenProblem).toHaveBeenCalledWith('p1');
  });
});
