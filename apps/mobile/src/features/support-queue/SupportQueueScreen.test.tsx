import { PERMISSIONS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths } from '../../shared/testing/harness';
import { SupportQueueScreen } from './SupportQueueScreen';
import { ASHA, lastButton, respond, sent, signIn } from './support-test-data';

/**
 * The support queue.
 *
 * What matters: nothing is fetched without `support-routing:manage`; the queue says why each
 * ticket is waiting and opens it; reassigning needs `ticket:reassign` and a reason; and the
 * routing trail can be read and the router re-run from the queue.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const fetchMock = jest.fn();
const MANAGER = [PERMISSIONS.SUPPORT_ROUTING_MANAGE, PERMISSIONS.TICKET_REASSIGN];

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('who may use it', () => {
  it('fetches nothing without support-routing:manage', async () => {
    signIn([PERMISSIONS.TICKET_READ]);
    respond(fetchMock);
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

    expect(await view.findByText('Not available')).toBeTruthy();
    expect(requestedPaths(fetchMock).some((path) => path.includes('/tickets/queue'))).toBe(false);
  });

  it('offers no reassign without ticket:reassign', async () => {
    signIn([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
    respond(fetchMock);
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

    await view.findByText('Invoices will not download');
    expect(view.queryByRole('button', { name: 'Reassign' })).toBeNull();
  });
});

describe('the queue', () => {
  it('says why each ticket is waiting and opens it', async () => {
    signIn(MANAGER);
    respond(fetchMock);
    const onOpenTicket = jest.fn();
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={onOpenTicket} />);

    expect(
      await view.findByText('Why it is here: Everybody on the chain is on leave'),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^SUP-7 Invoices will not download/));
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
  });

  it('says so when nothing is waiting', async () => {
    signIn(MANAGER);
    respond(fetchMock, []);
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

    expect(await view.findByText('Nothing waiting')).toBeTruthy();
  });

  it('reassigns only with somebody chosen and a reason', async () => {
    signIn(MANAGER);
    respond(fetchMock);
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Reassign' }));
    await fireEvent.press(await view.findByLabelText('Assign to: not set'));
    await fireEvent.press(await view.findByRole('radio', { name: 'Asha Rao, unavailable' }));
    expect(lastButton(view, 'Reassign').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByLabelText('Reason for reassigning'), 'Back tomorrow');
    await fireEvent.press(lastButton(view, 'Reassign'));
    await waitFor(() =>
      expect(sent(fetchMock, '/tickets/t1/reassign')).toEqual({
        method: 'POST',
        body: { assignedToId: 'u1', reason: 'Back tomorrow' },
      }),
    );
  });
});

describe('routing from the queue', () => {
  it('shows the trail and runs the router again', async () => {
    signIn(MANAGER);
    respond(fetchMock, undefined, {
      state: null,
      trail: [
        {
          id: 'r1',
          attempt: 1,
          position: 0,
          user: ASHA,
          role: 'PRIMARY_DEVELOPER',
          accepted: false,
          skipReason: 'ON_LEAVE',
          detail: 'On leave',
          policyVersion: 3,
          createdAt: '2026-09-28T04:00:00.000Z',
        },
      ],
    });
    const view = await renderScreen(<SupportQueueScreen onOpenTicket={jest.fn()} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Routing' }));
    expect(await view.findByText('Attempt 1 · policy v3')).toBeTruthy();
    expect(view.getByText('Primary developer')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Run the router' }));
    await waitFor(() =>
      expect(sent(fetchMock, '/tickets/t1/route')).toEqual({
        method: 'POST',
        body: { force: false },
      }),
    );
  });
});
