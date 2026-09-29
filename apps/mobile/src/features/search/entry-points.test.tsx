import { PERMISSIONS, ROLE_KEYS, type PermissionKey, type RoleKey } from '@ashniva/types';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DrawerProvider, MenuButton } from '../../navigation/drawer/drawer-context';
import type { RootStackParamList } from '../../navigation/param-lists';
import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { useSession } from '../auth/SessionProvider';
import { HomeHeader } from '../home/HomeHeader';

/**
 * The ways in, in a real navigator: Home's search field and "+", and the side menu's search row,
 * each landing on the route it names — and the "+" only for somebody who may create something.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeHost() {
  const { user } = useSession();
  return user ? <HomeHeader user={user} /> : null;
}

function MenuHost() {
  return <MenuButton />;
}

function App({ host }: { host: () => React.JSX.Element | null }) {
  return (
    <NavigationContainer>
      <DrawerProvider>
        <Stack.Navigator>
          <Stack.Screen name="Main" component={host} options={{ headerShown: false }} />
          <Stack.Screen name="Search" children={() => <Text>Search screen</Text>} />
          <Stack.Screen name="TaskForm" children={() => <Text>Task form</Text>} />
          <Stack.Screen name="RaiseTicket" children={() => <Text>Raise ticket form</Text>} />
        </Stack.Navigator>
      </DrawerProvider>
    </NavigationContainer>
  );
}

function signInAs(roleKey: RoleKey, permissions: PermissionKey[], client = false) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey,
      permissions,
      ...(client
        ? {
            organization: {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Northwind',
              slug: 'northwind',
              isServiceProvider: false,
            },
          }
        : {}),
    }),
  });
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async () =>
    jsonResponse({ count: 0, items: [], nextCursor: null }),
  ) as unknown as typeof fetch;
});

it('opens search from Home', async () => {
  signInAs(ROLE_KEYS.DEVELOPER, []);
  const view = await renderScreen(<App host={HomeHost} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Search' }));
  expect(await view.findByText('Search screen')).toBeTruthy();
});

it('opens a create form from Home’s "+"', async () => {
  signInAs(ROLE_KEYS.DEVELOPER, [PERMISSIONS.TASK_CREATE, PERMISSIONS.TICKET_RAISE]);
  const view = await renderScreen(<App host={HomeHost} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Create' }));
  expect(await view.findByRole('button', { name: 'Raise a ticket' })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'New task' }));

  expect(await view.findByText('Task form')).toBeTruthy();
});

it('offers a client only a ticket from the "+"', async () => {
  signInAs(ROLE_KEYS.CLIENT_ADMIN, [PERMISSIONS.TICKET_RAISE, PERMISSIONS.TASK_CREATE], true);
  const view = await renderScreen(<App host={HomeHost} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Create' }));
  expect(await view.findByRole('button', { name: 'Raise a ticket' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'New task' })).toBeNull();
});

it('draws no "+" for somebody who may create nothing, and still offers search', async () => {
  signInAs(ROLE_KEYS.DEVELOPER, []);
  const view = await renderScreen(<App host={HomeHost} />);

  expect(await view.findByRole('button', { name: 'Search' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Create' })).toBeNull();
});

it('opens search from the side menu, closing the menu on the way', async () => {
  signInAs(ROLE_KEYS.DEVELOPER, []);
  const view = await renderScreen(<App host={MenuHost} />);

  await fireEvent.press(await view.findByLabelText('Open menu'));
  await fireEvent.press(await view.findByRole('button', { name: 'Search' }));

  expect(await view.findByText('Search screen')).toBeTruthy();
});
