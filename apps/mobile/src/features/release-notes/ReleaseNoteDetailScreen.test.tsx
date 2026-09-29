import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../shared/testing/harness';
import { fakeApi, sent, signedIn } from '../releases/release-test-data';
import { noteDetail } from './release-note-test-data';
import { ReleaseNoteDetailScreen } from './ReleaseNoteDetailScreen';

/**
 * One release note: what the client will read kept apart from what they never will, and the
 * workflow steps gated by the same status and permission the API checks.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

const WRITER: PermissionKey[] = [PERMISSIONS.RELEASE_NOTE_READ, PERMISSIONS.RELEASE_NOTE_WRITE];
const APPROVER: PermissionKey[] = [PERMISSIONS.RELEASE_NOTE_READ, PERMISSIONS.RELEASE_NOTE_APPROVE];

async function open(note = noteDetail(), permissions: PermissionKey[] = WRITER) {
  fetchMock.mockImplementation(fakeApi({ '/release-notes/n1': note }));
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.PROJECT_MANAGER, permissions));
  const view = await renderScreen(<ReleaseNoteDetailScreen noteId="n1" />);
  await view.findByText('ACM 2026.09.1');
  return view;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('labels internal notes and lines, and previews only what the client sees', async () => {
  const view = await open();

  expect(view.getByText('Internal notes — never shown to the client')).toBeTruthy();
  expect(view.getByText('Internal only')).toBeTruthy();
  expect(view.getAllByText('The client sees this').length).toBeGreaterThan(0);
  expect(view.getByText('1 internal line is hidden from this view.')).toBeTruthy();
});

it('sends a draft for review', async () => {
  const view = await open();

  await fireEvent.press(view.getByRole('button', { name: 'Send for review' }));
  await waitFor(() => expect(sent(fetchMock, 'POST', '/release-notes/n1/submit')).toEqual({}));
});

it('reorders lines by sending the whole new order', async () => {
  const view = await open();

  await fireEvent.press(view.getByRole('button', { name: 'Move “Checkout is faster” down' }));
  await waitFor(() =>
    expect(sent(fetchMock, 'PATCH', '/release-notes/n1/items/order')).toEqual({
      itemIds: ['i2', 'i1'],
    }),
  );
});

it('asks for a reason before requesting changes', async () => {
  const view = await open(noteDetail({ status: 'IN_REVIEW' }), APPROVER);

  expect(view.queryByRole('button', { name: 'Send for review' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Request changes' }));
  const [, confirm] = view.getAllByRole('button', { name: 'Request changes' });
  if (!confirm) {
    throw new Error('The reason sheet did not open');
  }
  expect(confirm).toBeDisabled();

  await fireEvent.changeText(view.getByLabelText('Reason'), 'Say which invoices changed');
  await fireEvent.press(confirm);
  await waitFor(() =>
    expect(sent(fetchMock, 'POST', '/release-notes/n1/request-changes')).toEqual({
      note: 'Say which invoices changed',
    }),
  );
});

it('does not offer publishing without release-note:publish', async () => {
  const approver = await open(noteDetail({ status: 'APPROVED' }), APPROVER);
  expect(approver.queryByRole('button', { name: 'Publish to client' })).toBeNull();
});

it('offers publishing, and no editing, once the note is approved', async () => {
  const publisher = await open(noteDetail({ status: 'APPROVED' }), [
    PERMISSIONS.RELEASE_NOTE_READ,
    PERMISSIONS.RELEASE_NOTE_PUBLISH,
  ]);
  expect(publisher.getByRole('button', { name: 'Publish to client' })).toBeTruthy();
  expect(publisher.queryByRole('button', { name: 'Edit details' })).toBeNull();
});
