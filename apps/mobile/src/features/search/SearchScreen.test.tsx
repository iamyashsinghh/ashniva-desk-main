import { PERMISSIONS, ROLE_KEYS, type SearchResponse } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { clearRecentSearches } from './recent-searches';
import { SearchScreen } from './SearchScreen';

/**
 * The search screen against a fetch double: nothing is asked below the API's minimum, groups
 * arrive with their counts, a result opens its own phone route, and the full set is one tap away.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const RESULTS: SearchResponse = {
  query: 'acme',
  total: 3,
  truncated: false,
  groups: [
    {
      type: 'task',
      label: 'Tasks',
      hasMore: true,
      hits: [
        {
          type: 'task',
          id: 'task-1',
          reference: 'ACM-14',
          title: 'Fix the Acme login page',
          subtitle: 'Acme portal',
          status: 'IN_PROGRESS',
          href: '/tasks/task-1',
        },
      ],
    },
    {
      type: 'change-request',
      label: 'Change requests',
      hasMore: false,
      hits: [
        {
          type: 'change-request',
          id: 'cr-1',
          reference: 'CR-3',
          title: 'Acme export',
          subtitle: 'Acme Ltd',
          status: 'DRAFT',
          href: '/change-requests/cr-1',
        },
      ],
    },
  ],
};

function signInAs(client: boolean) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser(
      client
        ? {
            roleKey: ROLE_KEYS.CLIENT_ADMIN,
            permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.CHANGE_REQUEST_READ],
            organization: {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Northwind',
              slug: 'northwind',
              isServiceProvider: false,
            },
          }
        : { permissions: [PERMISSIONS.TASK_READ, PERMISSIONS.CHANGE_REQUEST_READ] },
    ),
  });
}

const searches = () => requestedPaths(fetchMock).filter((path) => path.includes('/search'));

beforeEach(() => {
  clearRecentSearches(sessionUser().id);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(async () => jsonResponse(RESULTS));
  signInAs(false);
});

it('asks for nothing until the term is long enough, and says so', async () => {
  const view = await renderScreen(<SearchScreen onBack={jest.fn()} onOpen={jest.fn()} />);

  expect(await view.findByText('Search everything you can see')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Search'), 'ac');

  expect(await view.findByText(/at least 3 characters/)).toBeTruthy();
  expect(searches()).toEqual([]);
});

it('shows each group with its count, and opens a result on its own route', async () => {
  const onOpen = jest.fn();
  const view = await renderScreen(<SearchScreen onBack={jest.fn()} onOpen={onOpen} />);

  await fireEvent.changeText(await view.findByLabelText('Search'), 'acme');

  expect(await view.findByLabelText('Tasks, 1+ match')).toBeTruthy();
  expect(view.getByLabelText('Change requests, 1 match')).toBeTruthy();
  expect(searches()[0]).toContain('/search?q=acme&limit=5');

  await fireEvent.press(
    view.getByRole('button', {
      name: 'ACM-14, Fix the Acme login page, Acme portal, Status: In progress',
    }),
  );
  expect(onOpen).toHaveBeenCalledWith({ screen: 'TaskDetail', id: 'task-1' });
});

it('asks for the full set from "Show more"', async () => {
  const view = await renderScreen(<SearchScreen onBack={jest.fn()} onOpen={jest.fn()} />);

  await fireEvent.changeText(await view.findByLabelText('Search'), 'acme');
  await fireEvent.press(await view.findByRole('button', { name: 'Show more tasks' }));

  await waitFor(() => expect(searches().some((path) => path.includes('limit=20'))).toBe(true));
});

it('says plainly when nothing matches', async () => {
  fetchMock.mockImplementation(async () =>
    jsonResponse({ query: 'zzz', total: 0, truncated: false, groups: [] }),
  );
  const view = await renderScreen(
    <SearchScreen initialQuery="zzz" onBack={jest.fn()} onOpen={jest.fn()} />,
  );

  expect(await view.findByText('No matches')).toBeTruthy();
});

it('opens a client’s change request on the portal screen', async () => {
  signInAs(true);
  const onOpen = jest.fn();
  const view = await renderScreen(
    <SearchScreen initialQuery="acme" onBack={jest.fn()} onOpen={onOpen} />,
  );

  await fireEvent.press(await view.findByRole('button', { name: /^CR-3, Acme export/ }));
  expect(onOpen).toHaveBeenCalledWith({ screen: 'PortalChangeRequestDetail', id: 'cr-1' });
});

it('keeps an opened search among the recent ones, for one tap back', async () => {
  const view = await renderScreen(<SearchScreen onBack={jest.fn()} onOpen={jest.fn()} />);

  await fireEvent.changeText(await view.findByLabelText('Search'), 'acme');
  await fireEvent.press(await view.findByRole('button', { name: /^CR-3, Acme export/ }));
  await fireEvent.changeText(view.getByLabelText('Search'), '');

  expect(await view.findByRole('button', { name: 'Search again for acme' })).toBeTruthy();
});
