import { PERMISSIONS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../shared/testing/harness';
import { SupportQueueScreen } from './SupportQueueScreen';
import { respond, sent, signIn } from './support-test-data';

/**
 * The Team and On call tabs of the support queue: each edit sends what the web's dialog sends,
 * and a schedule the API would refuse is stopped before it leaves the phone.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  signIn([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
  respond(fetchMock);
});

it('shows who covers the project, read-only', async () => {
  const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Team' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Support coverage' }));
  expect(await view.findByText('Billing')).toBeTruthy();
  expect(view.getByText(/done on the web/)).toBeTruthy();
});

it('records somebody’s availability for the project team', async () => {
  const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Team' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Availability' }));
  await fireEvent.press(await view.findByLabelText('State: On leave'));
  await fireEvent.press(await view.findByRole('radio', { name: 'Available' }));
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(sent(fetchMock, '/users/u1/availability')).toEqual({
      method: 'PATCH',
      body: { status: 'AVAILABLE', until: null, note: null },
    }),
  );
});

it('will not save a shift that starts and ends together', async () => {
  const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Team' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Hours' }));
  await fireEvent.changeText(view.getByLabelText('Shift ends'), '09:30');
  expect(await view.findByText('A shift cannot start and end at the same time.')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Save hours' }).props.accessibilityState.disabled).toBe(
    true,
  );

  await fireEvent.changeText(view.getByLabelText('Shift ends'), '18:00');
  await fireEvent.press(view.getByRole('button', { name: 'Save hours' }));
  await waitFor(() =>
    expect(sent(fetchMock, '/users/u1/work-schedule')).toEqual({
      method: 'PUT',
      body: {
        workingDays: [1, 2, 3, 4, 5],
        startTime: '09:30',
        endTime: '18:00',
        timezone: 'Asia/Kolkata',
        workloadLimit: null,
      },
    }),
  );
});

it('puts somebody on call for a date', async () => {
  const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

  await fireEvent.press(await view.findByRole('tab', { name: 'On call' }));
  await fireEvent.press(await view.findByLabelText('On call: not set'));
  await fireEvent.press(await view.findByRole('radio', { name: 'Asha Rao, unavailable' }));
  await fireEvent.press(view.getByRole('button', { name: 'Set cover' }));

  await waitFor(() => {
    const call = sent(fetchMock, '/projects/p1/on-call');
    expect(call?.method).toBe('PUT');
    expect(call?.body).toMatchObject({ userId: 'u1', backupUserId: null });
    expect((call?.body as { onDate: string }).onDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
