import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { AcceptInvitationScreen } from '../features/auth/AcceptInvitationScreen';
import { ForgotPasswordScreen } from '../features/auth/ForgotPasswordScreen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ResetPasswordScreen } from '../features/auth/ResetPasswordScreen';
import { useSession } from '../features/auth/SessionProvider';
import { OfflineBanner, SplashScreen } from '../shared/components/states';
import { useTheme } from '../shared/theme/ThemeProvider';
import { DEEP_LINK_PREFIXES, linkingConfig } from './deep-links';
import type { RootStackParamList } from './param-lists';
import { SignedInStack } from './SignedInStack';

/**
 * The navigation tree.
 *
 * Three states, and the app is only ever in one of them: restoring, signed out, signed in. There
 * is no route a signed-out person can reach, because when signed out the tree contains only the
 * sign-in screen and the account-recovery screens beside it — nothing is hidden behind a guard
 * that could be bypassed.
 *
 * What the signed-in half contains is in `SignedInStack`; the tab bar is in `tab-screens`. Both
 * are rebuilt from the person's permissions, so being granted one changes the app on the next
 * sign-in rather than needing a new build.
 */

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: DEEP_LINK_PREFIXES,
  config: linkingConfig,
};

/**
 * A reset or invitation link opens its screen with nothing beneath it, so "back" would leave the
 * app. Resetting to the sign-in screen works whether it was pushed from there or deep-linked.
 */
function backToSignIn(navigation: NativeStackNavigationProp<RootStackParamList>) {
  navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
}

export function RootNavigator() {
  const theme = useTheme();
  const { status, user } = useSession();

  const navigationTheme = useMemo(
    () => ({
      dark: theme.isDark,
      colors: {
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '900' as const },
      },
    }),
    [theme],
  );

  if (status === 'restoring') {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <OfflineBanner />
      {status === 'signed-out' || !user ? (
        <Stack.Navigator
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTitleStyle: { ...theme.typography.heading, color: theme.colors.text },
            headerTintColor: theme.colors.primary,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen
            name="Main"
            options={{ headerShown: false }}
            children={({ navigation }) => (
              <LoginScreen onForgotPassword={() => navigation.navigate('ForgotPassword')} />
            )}
          />
          <Stack.Screen
            name="ForgotPassword"
            options={{ title: 'Forgot password' }}
            children={({ navigation }) => (
              <ForgotPasswordScreen onDone={() => backToSignIn(navigation)} />
            )}
          />
          <Stack.Screen
            name="ResetPassword"
            options={{ title: 'Reset password' }}
            children={({ route, navigation }) => (
              <ResetPasswordScreen
                token={route.params.token}
                onDone={() => backToSignIn(navigation)}
              />
            )}
          />
          <Stack.Screen
            name="AcceptInvitation"
            options={{ title: 'Invitation' }}
            children={({ route, navigation }) => (
              <AcceptInvitationScreen
                token={route.params.token}
                onDone={() => backToSignIn(navigation)}
              />
            )}
          />
        </Stack.Navigator>
      ) : (
        <SignedInStack />
      )}
    </NavigationContainer>
  );
}
