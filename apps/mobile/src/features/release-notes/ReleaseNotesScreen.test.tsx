import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths } from '../../shared/testing/harness';
import { fakeApi, paged, signedIn } from '../releases/release-test-data';
import { noteSummary } from './release-note-test-data';
import { ReleaseNotesScreen } from './ReleaseNotesScreen';

/**
 * The internal release-note list. The view is an API filter; the search narrows what is loaded,
 * because the endpoint has none. "New release note" needs release-note:write.
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
    fakeApi({
      '/release-notes': paged([
        noteSummary(),
        noteSummary({ id: 'n2', projectCode: 'BLU', version: '1.4.0', status: 'IN_REVIEW' }),
      ]),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('lists notes with their status, narrows by search and opens one', async () => {
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.RELEASE_NOTE_READ]));
  const onOpen = jest.fn();
  const view = await renderScreen(<ReleaseNotesScreen onOpen={onOpen} />);

  expect(await view.findByText('2026.09.1')).toBeTruthy();
  expect(view.getByText('In review')).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText('Search project code or version'), 'blu');
  await waitFor(() => expect(view.queryByText('2026.09.1')).toBeNull());

  await fireEvent.press(view.getByRole('button', { name: 'BLU 1.4.0, In review' }));
  expect(onOpen).toHaveBeenCalledWith('n2');
});

it('asks the API for the review view', async () => {
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.RELEASE_NOTE_READ]));
  const view = await renderScreen(<ReleaseNotesScreen onOpen={jest.fn()} />);
  await view.findByText('2026.09.1');

  await fireEvent.press(view.getByRole('tab', { name: 'Waiting on review' }));
  await waitFor(() =>
    expect(requestedPaths(fetchMock).some((path) => path.includes('status=IN_REVIEW'))).toBe(true),
  );
});

it('does not offer "New release note" to a reader', async () => {
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.RELEASE_NOTE_READ]));
  const reader = await renderScreen(<ReleaseNotesScreen onOpen={jest.fn()} />);
  await reader.findByText('2026.09.1');
  expect(reader.queryByRole('button', { name: 'New release note' })).toBeNull();
});

it('offers "New release note" with release-note:write', async () => {
  restoreSession.mockResolvedValue(
    signedIn(ROLE_KEYS.PROJECT_MANAGER, [
      PERMISSIONS.RELEASE_NOTE_READ,
      PERMISSIONS.RELEASE_NOTE_WRITE,
    ]),
  );
  const writer = await renderScreen(<ReleaseNotesScreen onOpen={jest.fn()} />);
  await writer.findByText('2026.09.1');
  expect(writer.getByRole('button', { name: 'New release note' })).toBeTruthy();
});
