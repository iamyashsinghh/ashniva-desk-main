import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths } from '../../shared/testing/harness';
import { fakeApi, paged, releaseSummary, signedIn } from './release-test-data';
import { ReleasesScreen } from './ReleasesScreen';

/**
 * The release list. View, search and project are `GET /releases` parameters, so what is asserted
 * is the request; "New release" needs release:manage, like the list itself.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    fakeApi({ '/releases': paged([releaseSummary({ status: 'APPROVAL_REQUESTED' })]) }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue(
    signedIn(ROLE_KEYS.PROJECT_MANAGER, [PERMISSIONS.RELEASE_MANAGE]),
  );
});

it('lists releases in flight with their status and opens one', async () => {
  const onOpen = jest.fn();
  const view = await renderScreen(<ReleasesScreen onOpen={onOpen} />);

  expect(await view.findByText('2026.09.1 — September release')).toBeTruthy();
  expect(view.getByText('Approval requested')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('status=DRAFT'))).toBe(true);

  await fireEvent.press(
    view.getByRole('button', {
      name: 'Acme portal, 2026.09.1 — September release, Approval requested',
    }),
  );
  expect(onOpen).toHaveBeenCalledWith('r1');
});

it('switches views and searches on the server', async () => {
  const view = await renderScreen(<ReleasesScreen onOpen={jest.fn()} />);
  await view.findByText('2026.09.1 — September release');

  await fireEvent.press(view.getByRole('tab', { name: 'Published' }));
  await waitFor(() =>
    expect(
      requestedPaths(fetchMock).some((path) =>
        decodeURIComponent(path).includes('status=PUBLISHED,VERIFIED'),
      ),
    ).toBe(true),
  );

  await fireEvent.changeText(view.getByLabelText('Search version or title'), 'sept');
  await waitFor(() =>
    expect(requestedPaths(fetchMock).some((path) => path.includes('search=sept'))).toBe(true),
  );
});

it('offers "New release" with release:manage', async () => {
  const view = await renderScreen(<ReleasesScreen onOpen={jest.fn()} />);
  await view.findByText('2026.09.1 — September release');
  expect(view.getByRole('button', { name: 'New release' })).toBeTruthy();
});

it('does not offer "New release" without release:manage', async () => {
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.RELEASE_APPROVE]));
  const view = await renderScreen(<ReleasesScreen onOpen={jest.fn()} />);
  await view.findByText('2026.09.1 — September release');
  expect(view.queryByRole('button', { name: 'New release' })).toBeNull();
});
