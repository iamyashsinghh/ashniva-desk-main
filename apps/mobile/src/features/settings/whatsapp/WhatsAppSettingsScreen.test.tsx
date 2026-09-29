import { PERMISSIONS, type WhatsAppSettings } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { WhatsAppSettingsScreen } from './WhatsAppSettingsScreen';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const SETTINGS: WhatsAppSettings = {
  enabled: true,
  businessAccountId: '102290129340398',
  phoneNumberId: '106540352242922',
  displayPhoneNumber: null,
  apiVersion: 'v21.0',
  templateLanguage: 'en',
  templateNames: { TEST: 'hello_world' },
  hasAccessToken: true,
  hasAppSecret: false,
  hasVerifyToken: true,
  webhookUrl: 'https://desk.example.com/api/webhooks/whatsapp/org-1',
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
};

const fetchMock = jest.fn();

function routes(settings: WhatsAppSettings | null) {
  return apiRoutes({
    'GET /settings/whatsapp': settings,
    'PUT /settings/whatsapp': SETTINGS,
    'POST /settings/whatsapp/test-connection': { ok: true, message: 'Connected to Meta' },
    'POST /settings/whatsapp/test-message': { queued: true, message: 'Test queued' },
    'GET /settings/whatsapp/history': { items: [], nextCursor: null },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(routes(SETTINGS));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the webhook and which secrets are stored, without any secret inputs for readers', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ]);
  const view = await renderScreen(<WhatsAppSettingsScreen />);

  expect(await view.findByText(SETTINGS.webhookUrl as string)).toBeTruthy();
  expect(view.getByLabelText('Status: No app secret')).toBeTruthy();
  expect(view.queryByLabelText('Access token')).toBeNull();
  expect(view.queryByText('Send a test')).toBeNull();
  expect(view.queryByRole('button', { name: 'Save settings' })).toBeNull();
});

it('saves only the secrets that were typed', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<WhatsAppSettingsScreen />);

  await fireEvent.changeText(await view.findByLabelText('App secret'), 'app-secret-value');
  await fireEvent.press(view.getByRole('button', { name: 'Save settings' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PUT', '/settings/whatsapp')).toEqual({
      businessAccountId: '102290129340398',
      phoneNumberId: '106540352242922',
      apiVersion: 'v21.0',
      templateLanguage: 'en',
      templateNames: { TEST: 'hello_world' },
      enabled: true,
      appSecret: 'app-secret-value',
    }),
  );
  expect(await view.findByText('Settings saved.')).toBeTruthy();
  expect(view.getByLabelText('App secret').props.value).toBe('');
});

it('tests the connection and sends a test template', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<WhatsAppSettingsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Test connection' }));
  expect(await view.findByText('Connected to Meta')).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText('Test number'), '+441234567890');
  await fireEvent.press(view.getByRole('button', { name: 'Send test message' }));
  expect(await view.findByText('Test queued')).toBeTruthy();
  expect(sentBody(fetchMock, 'POST', '/settings/whatsapp/test-message')).toEqual({
    template: 'TEST',
    toPhone: '+441234567890',
  });
});

it('refuses to test without a stored access token', async () => {
  fetchMock.mockImplementation(routes({ ...SETTINGS, hasAccessToken: false }));
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<WhatsAppSettingsScreen />);

  expect(await view.findByLabelText('Status: No access token')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Test connection' })).toBeDisabled();
  expect(wasSent(fetchMock, 'POST', '/settings/whatsapp/test-connection')).toBe(false);
});
