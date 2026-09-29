import { PERMISSIONS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../../shared/testing/harness';
import { apiRoutes, sentBody, signInWith, wasSent } from '../shared/test-support';
import { DETAIL, SUMMARY, UNLINKED } from './product-test-data';
import { ProductsScreen } from './ProductsScreen';

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
      'GET /products': [SUMMARY, UNLINKED],
      'POST /products': { ...DETAIL, id: 'prod-new' },
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('asks for nothing without product:read', async () => {
  signInWith([PERMISSIONS.TICKET_READ]);
  const view = await renderScreen(<ProductsScreen onOpen={jest.fn()} />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(wasSent(fetchMock, 'GET', '/products')).toBe(false);
});

it('lists products with the states that stop them working, and filters to those', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ]);
  const onOpen = jest.fn();
  const view = await renderScreen(<ProductsScreen onOpen={onOpen} />);

  expect(await view.findByText('Carelix')).toBeTruthy();
  expect(view.getByText('Irista')).toBeTruthy();
  expect(view.getByLabelText('Status: Not linked')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Register a product' })).toBeNull();

  await fireEvent.press(view.getByText('Needs setup'));
  expect(view.queryByText('Carelix')).toBeNull();

  await fireEvent.press(view.getByLabelText('Irista, IRISTA'));
  expect(onOpen).toHaveBeenCalledWith('prod-2');
});

it('registers a product and opens it', async () => {
  signInWith([PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_MANAGE]);
  const onOpen = jest.fn();
  const view = await renderScreen(<ProductsScreen onOpen={onOpen} />);
  await view.findByText('Carelix');

  await fireEvent.press(view.getByRole('button', { name: 'Register a product' }));
  await fireEvent.changeText(view.getByLabelText('Code'), 'nova');
  await fireEvent.changeText(view.getByLabelText('Name'), 'Nova');
  await fireEvent.press(view.getByRole('button', { name: 'Register' }));

  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('prod-new'));
  expect(sentBody(fetchMock, 'POST', '/products')).toEqual({
    code: 'NOVA',
    name: 'Nova',
    projectId: null,
  });
});
