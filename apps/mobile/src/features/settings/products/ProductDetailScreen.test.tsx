import { PERMISSIONS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { ProductDetailScreen } from './ProductDetailScreen';
import { DETAIL, IVR_POLICY, READINESS, TIERS } from './product-test-data';

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      'GET /products/prod-1': DETAIL,
      'PATCH /products/prod-1': DETAIL,
      'POST /products/prod-1/credentials': {
        credential: { ...DETAIL.credentials[0], id: 'cred-2', label: 'Staging' },
        secret: 'ask_key_new.s3cret',
      },
      'GET /products/prod-1/callbacks': null,
      'GET /products/prod-1/ivr-policy': IVR_POLICY,
      'PUT /products/prod-1/ivr-policy': IVR_POLICY,
      'GET /ivr/health': READINESS,
      'GET /support-tiers': TIERS,
      'GET /projects': [],
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows a read-only product without the manage-only sections', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ]);
  const view = await renderScreen(<ProductDetailScreen productId="prod-1" />);

  expect(await view.findByText('Support settings')).toBeTruthy();
  expect(view.getByText('Carelix production')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(view.queryByText('Status callbacks')).toBeNull();
  expect(view.queryByText('Support calls')).toBeNull();
  expect(wasSent(fetchMock, 'GET', '/products/prod-1/callbacks')).toBe(false);
  expect(wasSent(fetchMock, 'GET', '/ivr/health')).toBe(false);
});

it('saves the support settings', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_MANAGE]);
  const view = await renderScreen(<ProductDetailScreen productId="prod-1" />);
  await view.findByText('Support settings');

  await fireEvent.press(view.getByLabelText('Edit'));
  await fireEvent.changeText(view.getByLabelText('Widget origins'), 'https://a.example.com, ');
  await fireEvent.press(view.getByRole('button', { name: 'Save settings' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PATCH', '/products/prod-1')).toMatchObject({
      name: 'Carelix',
      projectId: 'p1',
      allowedWorkAreas: ['Billing'],
      allowedOrigins: ['https://a.example.com'],
      isActive: true,
    }),
  );
  expect(await view.findByText('Settings saved.')).toBeTruthy();
});

it('issues a credential and shows its secret once', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_MANAGE]);
  const view = await renderScreen(<ProductDetailScreen productId="prod-1" />);
  await view.findByText('Support settings');

  await fireEvent.changeText(view.getByLabelText('What is this credential for?'), 'Staging');
  await fireEvent.press(view.getByRole('button', { name: 'Issue credential' }));

  expect(await view.findByText('ask_key_new.s3cret')).toBeTruthy();
  expect(sentBody(fetchMock, 'POST', '/products/prod-1/credentials')).toEqual({
    label: 'Staging',
  });
  await fireEvent.press(view.getByRole('button', { name: 'I have saved it' }));
  expect(view.queryByText('ask_key_new.s3cret')).toBeNull();
});

it('shows IVR readiness and saves the call policy for ivr:manage', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ, PERMISSIONS.IVR_MANAGE]);
  const view = await renderScreen(<ProductDetailScreen productId="prod-1" />);

  expect(await view.findByText('The Tata adapter cannot place calls yet.')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Edit'));
  await fireEvent.changeText(view.getByLabelText('Destinations to try'), '4');
  await fireEvent.press(view.getByRole('button', { name: 'Save call policy' }));

  await waitFor(() =>
    expect(sentBody(fetchMock, 'PUT', '/products/prod-1/ivr-policy')).toMatchObject({
      maxAttempts: 4,
      allowedTiers: [],
      fallbackUserId: null,
    }),
  );
  expect(await view.findByText('Call policy saved.')).toBeTruthy();
});
