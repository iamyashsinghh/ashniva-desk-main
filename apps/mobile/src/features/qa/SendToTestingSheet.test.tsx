import { PERMISSIONS, TESTING_ASSIGNMENT_KIND, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { useSession } from '../auth/SessionProvider';
import { SendToTestingButton, SendToTestingSheet, type TestingSubject } from './SendToTestingSheet';

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const SUBJECT: TestingSubject = {
  projectId: 'p1',
  taskId: 't1',
  assignedToUserId: 'u9',
  assignedToName: 'Asha Iyer',
  label: 'Saved cards at checkout',
};

/** Rendered once the session has loaded, so "no button" is not just "no session yet". */
function SignedInMarker() {
  const { user } = useSession();
  return user ? <Text>signed in</Text> : null;
}

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({ status: 'signed-in', user: sessionUser({ permissions }) });
}

function sentBody(): unknown {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/qa/assignments'));
  const body = (call?.[1] as RequestInit | undefined)?.body;
  return typeof body === 'string' ? JSON.parse(body) : null;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(jsonResponse({ id: 'qa7' }));
});

it('hands the work to the tester already on it, on staging, with the brief prefilled', async () => {
  signIn([PERMISSIONS.QA_ASSIGN]);
  const onSent = jest.fn();
  const onClose = jest.fn();
  const view = await renderScreen(
    <SendToTestingSheet subject={SUBJECT} onClose={onClose} onSent={onSent} />,
  );

  expect(
    await view.findByText('Asha Iyer is the tester on this, so it goes to them.'),
  ).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Where to test it'), ' https://staging.test ');
  await fireEvent.press(view.getByRole('button', { name: 'Send for testing' }));

  expect(sentBody()).toEqual({
    projectId: 'p1',
    kind: TESTING_ASSIGNMENT_KIND.QA,
    environment: 'STAGING',
    taskId: 't1',
    assignedToUserId: 'u9',
    stagingUrl: 'https://staging.test',
    whatToTest: 'Saved cards at checkout',
  });
  await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 'qa7' })));
  expect(onClose).toHaveBeenCalled();
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Send for testing' }).props.accessibilityState.disabled,
    ).toBeFalsy(),
  );
});

it('defaults a live verification to production', async () => {
  signIn([PERMISSIONS.QA_ASSIGN]);
  const view = await renderScreen(
    <SendToTestingSheet
      subject={{ projectId: 'p1', releaseId: 'r1', label: 'v2.4.0' }}
      kind={TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION}
      onClose={jest.fn()}
    />,
  );

  expect(
    await view.findByText(
      'Nobody is named as the tester, so this goes to the "ready for testing" queue for any tester to pick up.',
    ),
  ).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Send for live verification' }));
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Send for live verification' }).props.accessibilityState
        .disabled,
    ).toBeFalsy(),
  );
  expect(sentBody()).toMatchObject({
    kind: TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION,
    environment: 'PRODUCTION',
    releaseId: 'r1',
  });
});

it('draws the button for somebody with qa:assign, and opens the sheet from it', async () => {
  signIn([PERMISSIONS.QA_ASSIGN]);
  const view = await renderScreen(<SendToTestingButton subject={SUBJECT} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Send for testing' }));
  expect(await view.findByLabelText('What to test')).toBeTruthy();
});

it('draws no button for somebody without qa:assign', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT]);
  const view = await renderScreen(
    <>
      <SignedInMarker />
      <SendToTestingButton subject={SUBJECT} />
    </>,
  );

  expect(await view.findByText('signed in')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Send for testing' })).toBeNull();
});
