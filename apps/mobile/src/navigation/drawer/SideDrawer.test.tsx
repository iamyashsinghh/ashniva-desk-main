import { DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import type { RootStackParamList } from '../param-lists';
import { MainTabs } from '../tab-screens';
import { DrawerProvider } from './drawer-context';

/**
 * The side menu in a real navigator: the ☰ button opens it, the bar has no Menu button of its own,
 * and an entry lands where it says.
 */

jest.mock('../../features/auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

jest.mock('../tab-contents', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const { MenuButton: MockMenuButton } = jest.requireActual('./drawer-context');
  const screen = (name: string) => () => (
    <>
      {/* Home paints its own header, with its own ☰ button. */}
      {name === 'Home' ? <MockMenuButton /> : null}
      <MockText>{`${name} screen`}</MockText>
    </>
  );
  return {
    TAB_SCREENS: Object.fromEntries(
      [
        'Home',
        'Tasks',
        'Tickets',
        'Messages',
        'Updates',
        'Notifications',
        'Invoices',
        'Profile',
      ].map((name) => [name, screen(name)]),
    ),
  };
});

const { restoreSession } = jest.requireMock('../../features/auth/auth-api') as {
  restoreSession: jest.Mock;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <NavigationContainer>
      <DrawerProvider>
        <Stack.Navigator>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Projects" children={() => <Text>Projects screen</Text>} />
        </Stack.Navigator>
      </DrawerProvider>
    </NavigationContainer>
  );
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async () =>
    jsonResponse({ count: 0, items: [], nextCursor: null }),
  ) as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.TEAM_LEAD,
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.TEAM_LEAD],
    }),
  });
});

it('opens the side menu from the ☰ button, with no Menu button on the bar', async () => {
  const view = await renderScreen(<App />);
  await view.findByText('Home screen');
  expect(view.queryByLabelText('Menu')).toBeNull();

  fireEvent.press(view.getByLabelText('Open menu'));

  expect(await view.findByText('Intern work')).toBeTruthy();
  expect(view.getByText('Support queue')).toBeTruthy();
});

it('opens a stack screen from the menu', async () => {
  const view = await renderScreen(<App />);
  await view.findByText('Home screen');

  fireEvent.press(view.getByLabelText('Open menu'));
  fireEvent.press(await view.findByText('Projects'));

  expect(await view.findByText('Projects screen')).toBeTruthy();
});

it('opens a tab that is not on the bar, with the bar and the ☰ button still there', async () => {
  const view = await renderScreen(<App />);
  await view.findByText('Home screen');

  fireEvent.press(view.getByLabelText('Open menu'));
  fireEvent.press(await view.findByText('Tickets'));

  await waitFor(() => expect(view.getByText('Tickets screen')).toBeTruthy());
  expect(view.getByLabelText('Home')).toBeTruthy();
  expect(view.getByLabelText('Open menu')).toBeTruthy();
});
