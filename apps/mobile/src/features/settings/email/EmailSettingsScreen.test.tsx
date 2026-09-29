import { PERMISSIONS, type EmailSettings } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { EmailSettingsScreen } from './EmailSettingsScreen';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const SETTINGS: EmailSettings = {
  enabled: true,
  senderName: 'Ashniva Desk',
  senderEmail: 'noreply@example.com',
  replyTo: null,
  host: 'smtp.example.com',
  port: 587,
  encryption: 'STARTTLS',
  username: 'mailer',
  hasPassword: true,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
};

const HISTORY = {
  items: [
    {
      id: 'm1',
      channel: 'EMAIL',
      template: 'TEST',
      destination: 'p•••a@example.com',
      subject: null,
      status: 'SENT',
      attempts: 1,
      lastError: null,
      queuedAt: '2026-09-01T10:00:00.000Z',
      sentAt: '2026-09-01T10:00:05.000Z',
    },
  ],
  nextCursor: null,
};

const fetchMock = jest.fn();

function routes(settings: EmailSettings | null) {
  return apiRoutes({
    'GET /settings/email': settings,
    'PUT /settings/email': SETTINGS,
    'POST /settings/email/test-connection': { ok: false, message: 'Authentication failed' },
    'POST /settings/email/test-message': { queued: true, message: 'Queued to your address' },
    'GET /settings/email/history': HISTORY,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(routes(SETTINGS));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the settings read-only without integration:manage, and never the password', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ]);
  const view = await renderScreen(<EmailSettingsScreen />);

  expect(await view.findByLabelText('Status: Ready')).toBeTruthy();
  expect(view.getByLabelText('Status: Stored')).toBeTruthy();
  expect(view.queryByLabelText('Password')).toBeNull();
  expect(view.queryByRole('button', { name: 'Save settings' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Test connection' })).toBeNull();
});

it('saves without a password unless one was typed', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<EmailSettingsScreen />);

  await fireEvent.changeText(await view.findByLabelText('Port'), '465');
  await fireEvent.press(view.getByRole('button', { name: 'Save settings' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PUT', '/settings/email')).toEqual({
      senderName: 'Ashniva Desk',
      senderEmail: 'noreply@example.com',
      host: 'smtp.example.com',
      port: 465,
      encryption: 'STARTTLS',
      enabled: true,
      username: 'mailer',
    }),
  );
  expect(await view.findByText('Settings saved.')).toBeTruthy();
});

it('reports a failed connection test as a failure, and sends a test to me', async () => {
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<EmailSettingsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Test connection' }));
  expect(await view.findByText('Authentication failed')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Send a test to myself' }));
  expect(await view.findByText('Queued to your address')).toBeTruthy();
  expect(wasSent(fetchMock, 'POST', '/settings/email/test-message')).toBe(true);
});

it('offers no tests before anything is saved', async () => {
  fetchMock.mockImplementation(routes(null));
  signInWith([PERMISSIONS.INTEGRATION_READ, PERMISSIONS.INTEGRATION_MANAGE]);
  const view = await renderScreen(<EmailSettingsScreen />);

  expect(await view.findByLabelText('Status: Not set up')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Test connection' })).toBeDisabled();
});
