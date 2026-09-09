import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { LoginScreen } from './LoginScreen';
import { SessionProvider } from './SessionProvider';

/**
 * The sign-in screen, rendered.
 *
 * `render` and `fireEvent` are async in this version of the testing library — each awaits React's
 * work loop — so every interaction below is awaited. The async-query timeout is raised globally
 * in `jest.setup.js`; the first render of the first suite is slower than the library's default.
 *
 * Not a snapshot: the things worth asserting are that the fields are reachable by an accessible
 * label, that a bad password produces a readable message rather than a blank screen, and that the
 * button is not tappable until the form could succeed.
 */

jest.mock('./auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(async () => ({ status: 'signed-out' })),
}));

const { login } = jest.requireMock('./auth-api') as { login: jest.Mock };

function renderScreen(): Promise<RenderResult> {
  // The session provider clears the query cache on sign-out, so it needs a client above it —
  // the same arrangement as App.tsx.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <LoginScreen />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  login.mockReset();
});

describe('the sign-in form', () => {
  it('labels both fields for a screen reader', async () => {
    const view = await renderScreen();

    expect(await view.findByLabelText('Email address')).toBeTruthy();
    expect(view.getByLabelText('Password')).toBeTruthy();
  });

  it('keeps the button unavailable until the form could succeed', async () => {
    const view = await renderScreen();
    const button = await view.findByRole('button', { name: 'Sign in' });

    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByLabelText('Email address'), 'priya@example.com');
    await fireEvent.changeText(view.getByLabelText('Password'), 'a-long-enough-password');

    await waitFor(() => {
      expect(view.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(
        false,
      );
    });
  });

  it('signs in with what was typed', async () => {
    login.mockResolvedValueOnce({ id: 'u1' });
    const view = await renderScreen();

    await fireEvent.changeText(
      await view.findByLabelText('Email address'),
      '  priya@example.com  ',
    );
    await fireEvent.changeText(view.getByLabelText('Password'), 'a-long-enough-password');
    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      // Trimmed: a keyboard's autocorrect adds a trailing space more often than anyone admits.
      expect(login).toHaveBeenCalledWith('priya@example.com', 'a-long-enough-password');
    });
  });

  it('shows the reason a sign-in failed', async () => {
    login.mockRejectedValueOnce(new Error('That email and password did not match'));
    const view = await renderScreen();

    await fireEvent.changeText(await view.findByLabelText('Email address'), 'priya@example.com');
    await fireEvent.changeText(view.getByLabelText('Password'), 'a-long-enough-password');
    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    expect(await view.findByText('That email and password did not match')).toBeTruthy();
  });

  it('uses a large enough input font that the platforms do not zoom', async () => {
    const view = await renderScreen();
    const email = await view.findByLabelText('Email address');

    const style = Array.isArray(email.props.style)
      ? Object.assign({}, ...email.props.style.filter(Boolean))
      : email.props.style;
    expect(style.fontSize).toBeGreaterThanOrEqual(16);
  });
});
