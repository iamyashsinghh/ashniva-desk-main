import { PERMISSIONS, type CommunicationSettingsSummary } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { CommunicationSettingsScreen } from './CommunicationSettingsScreen';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const SETTINGS: CommunicationSettingsSummary = {
  organizationId: 'org-1',
  chatEnabled: true,
  callingEnabled: false,
  recordingPolicy: 'DISABLED',
  recordingPlaybackScope: 'LEADS_ONLY',
  internalCallFallback: 'NONE',
  updatedAt: null,
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      'GET /communication/settings': SETTINGS,
      'PUT /communication/settings': { ...SETTINGS, callingEnabled: true },
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('asks for nothing without conversation:settings-manage', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ]);
  const view = await renderScreen(<CommunicationSettingsScreen />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(wasSent(fetchMock, 'GET', '/communication/settings')).toBe(false);
});

it('turns calling on and saves every setting', async () => {
  signInWith([PERMISSIONS.CONVERSATION_SETTINGS_MANAGE]);
  const view = await renderScreen(<CommunicationSettingsScreen />);

  expect(await view.findByText('Never changed — these are the defaults.')).toBeTruthy();
  await fireEvent(view.getByLabelText('Internal calling'), 'valueChange', true);
  await fireEvent.press(view.getByRole('button', { name: 'Save settings' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PUT', '/communication/settings')).toEqual({
      chatEnabled: true,
      callingEnabled: true,
      recordingPolicy: 'DISABLED',
      recordingPlaybackScope: 'LEADS_ONLY',
      internalCallFallback: 'NONE',
    }),
  );
  expect(await view.findByText('Settings saved.')).toBeTruthy();
});
