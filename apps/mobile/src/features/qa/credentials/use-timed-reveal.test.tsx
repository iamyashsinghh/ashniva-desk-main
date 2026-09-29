import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useTimedReveal } from './use-timed-reveal';

/**
 * The password's lifetime on screen: the server's window, and not a second longer — nor past the
 * moment the app leaves the foreground, when the app switcher would photograph it.
 */

const CREDENTIAL = {
  username: 'admin@test',
  secret: 'correct horse battery',
  visibleForSeconds: 3,
  expiresAt: '2026-09-28T18:00:00.000Z',
};

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  appStateListener = null;
  remove.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('counts down and forgets the password when the window closes', async () => {
  const { result } = await renderHook(() => useTimedReveal());

  await act(async () => result.current.show(CREDENTIAL));
  expect(result.current.revealed?.secret).toBe('correct horse battery');
  expect(result.current.secondsLeft).toBe(3);

  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(result.current.secondsLeft).toBe(2);

  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(result.current.revealed).toBeNull();
  expect(result.current.hasLapsed).toBe(true);
});

it('hides it the moment the app leaves the foreground', async () => {
  const { result } = await renderHook(() => useTimedReveal());

  await act(async () => result.current.show(CREDENTIAL));
  await act(async () => appStateListener?.('background'));
  expect(result.current.revealed).toBeNull();
});

it('hides it on request without calling it a lapse, and stops listening on unmount', async () => {
  const { result, unmount } = await renderHook(() => useTimedReveal());

  await act(async () => result.current.show(CREDENTIAL));
  await act(async () => result.current.hide());
  expect(result.current.revealed).toBeNull();
  expect(result.current.hasLapsed).toBe(false);

  await act(async () => unmount());
  expect(remove).toHaveBeenCalled();
});
