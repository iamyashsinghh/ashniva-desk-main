import {
  DEFAULT_BRANDING,
  PERMISSIONS,
  THEME_DOCUMENT_VERSION,
  type AdminBrandingView,
} from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { BrandingSettingsScreen } from './BrandingSettingsScreen';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const VIEW: AdminBrandingView = {
  effective: DEFAULT_BRANDING,
  stored: {},
  themeSource: {
    source: 'local',
    healthy: true,
    ready: ['Branding is stored with the organization'],
    missing: [],
    behaviourWhenUnready: 'Nothing is waiting on anybody.',
    lastDocumentAt: null,
  },
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      'GET /admin/branding': VIEW,
      'PATCH /admin/branding': VIEW,
      'GET /branding': DEFAULT_BRANDING,
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('asks for nothing without branding:manage', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ]);
  const view = await renderScreen(<BrandingSettingsScreen />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(wasSent(fetchMock, 'GET', '/admin/branding')).toBe(false);
});

it('saves the name, logo text and the whole theme document', async () => {
  signInWith([PERMISSIONS.BRANDING_MANAGE]);
  const view = await renderScreen(<BrandingSettingsScreen />);

  await fireEvent.changeText(await view.findByLabelText('Product name'), 'Acme Desk');
  await fireEvent.changeText(view.getByLabelText('Logo text'), 'AC');
  await fireEvent.changeText(view.getByLabelText('Primary colour'), '#112233');
  await fireEvent.press(view.getByRole('button', { name: 'Save branding' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PATCH', '/admin/branding')).toMatchObject({
      productName: 'Acme Desk',
      logoText: 'AC',
      theme: {
        version: THEME_DOCUMENT_VERSION,
        colors: { brandPrimary: '#112233', surface: DEFAULT_BRANDING.theme.colors.surface },
      },
    }),
  );
  expect(await view.findByText('Branding saved.')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Remove logo' })).toBeNull();
});

it('resets the theme to the defaults', async () => {
  signInWith([PERMISSIONS.BRANDING_MANAGE]);
  const view = await renderScreen(<BrandingSettingsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Reset to defaults' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PATCH', '/admin/branding')).toEqual({
      theme: { version: THEME_DOCUMENT_VERSION },
    }),
  );
  expect(await view.findByText('Theme reset to the Ashniva Desk defaults.')).toBeTruthy();
});
