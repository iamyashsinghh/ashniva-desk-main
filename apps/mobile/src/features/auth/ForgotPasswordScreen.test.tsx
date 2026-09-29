import { fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../../shared/api/client';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

/**
 * The reset request screen must answer the same way for every address — the API does, and a
 * screen that said "no such account" would undo that.
 */

jest.mock('./account-api', () => ({ requestPasswordReset: jest.fn() }));

const { requestPasswordReset } = jest.requireMock('./account-api') as {
  requestPasswordReset: jest.Mock;
};

function renderScreen(onDone = jest.fn()): Promise<RenderResult> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <ForgotPasswordScreen onDone={onDone} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  requestPasswordReset.mockReset();
});

describe('the forgot-password screen', () => {
  it('sends the trimmed address and shows the neutral confirmation', async () => {
    requestPasswordReset.mockResolvedValueOnce(undefined);
    const view = await renderScreen();

    await fireEvent.changeText(await view.findByLabelText('Email address'), ' priya@example.com ');
    await fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));

    expect(requestPasswordReset).toHaveBeenCalledWith('priya@example.com');
    expect(await view.findByText(/If an account exists for priya@example.com/)).toBeTruthy();
  });

  it('shows why a request could not be sent, such as the rate limit', async () => {
    requestPasswordReset.mockRejectedValueOnce(
      new ApiError(429, { message: 'Too many requests' }, 'Request failed (429)'),
    );
    const view = await renderScreen();

    await fireEvent.changeText(await view.findByLabelText('Email address'), 'priya@example.com');
    await fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));

    expect(await view.findByText('Too many requests')).toBeTruthy();
  });

  it('goes back to sign in', async () => {
    const onDone = jest.fn();
    const view = await renderScreen(onDone);

    await fireEvent.press(await view.findByRole('button', { name: 'Back to sign in' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
