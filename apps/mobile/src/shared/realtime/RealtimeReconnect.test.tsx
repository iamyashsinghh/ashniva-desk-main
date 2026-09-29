import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { resetSessionForTests, setSession } from '../../features/auth/session-store';
import { RealtimeProvider } from './RealtimeProvider';

/**
 * The gateway checks the access token only as a connection opens. These tests hold the two
 * things that keep a quiet chat screen live past the token's fifteen minutes: every handshake
 * presents the current token, and a refused one prompts a refresh.
 */

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  handlers: Map<string, Handler>;
  auth: (callback: (data: { token: string | null }) => void) => void;
}

const sockets: FakeSocket[] = [];

jest.mock('socket.io-client', () => ({
  io: jest.fn((_origin: string, options: { auth: FakeSocket['auth'] }) => {
    const socket: FakeSocket = { handlers: new Map(), auth: options.auth };
    sockets.push(socket);
    return {
      on: (event: string, handler: Handler) => socket.handlers.set(event, handler),
      removeAllListeners: jest.fn(),
      disconnect: jest.fn(),
    };
  }),
}));

jest.mock('../api/client', () => ({ refreshSession: jest.fn(async () => true) }));

const { refreshSession } = jest.requireMock('../api/client') as { refreshSession: jest.Mock };

const user = { id: 'u1', permissions: [] } as unknown as Parameters<typeof setSession>[1];

async function renderProvider() {
  const view = await render(
    <QueryClientProvider client={new QueryClient()}>
      <RealtimeProvider>{null}</RealtimeProvider>
    </QueryClientProvider>,
  );
  expect(sockets).toHaveLength(1);
  return view;
}

beforeAll(() => {
  // The socket is only opened while the app is in the foreground.
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
});

beforeEach(() => {
  sockets.length = 0;
  refreshSession.mockClear();
  resetSessionForTests();
});

it('presents the current token at every handshake, not the one it opened with', async () => {
  await setSession('first', user);
  await renderProvider();

  // Swapped underneath without the provider noticing, as between a drop and a reconnect.
  const socket = sockets.at(-1);
  await act(async () => {
    await setSession('second', user);
  });
  let presented: string | null = null;
  socket?.auth(({ token }) => {
    presented = token;
  });
  expect(presented).toBe('second');
});

it('refreshes when the gateway turns the connection away, and only once in a while', async () => {
  await setSession('expired', user);
  await renderProvider();
  const disconnect = sockets.at(-1)?.handlers.get('disconnect');

  await act(async () => disconnect?.('io server disconnect'));
  await act(async () => disconnect?.('io server disconnect'));
  expect(refreshSession).toHaveBeenCalledTimes(1);
});

it('does not refresh for a connection that simply dropped', async () => {
  await setSession('fine', user);
  await renderProvider();

  await act(async () => sockets.at(-1)?.handlers.get('disconnect')?.('transport close'));
  expect(refreshSession).not.toHaveBeenCalled();
});
