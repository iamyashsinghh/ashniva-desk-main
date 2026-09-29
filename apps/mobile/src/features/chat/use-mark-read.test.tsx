import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { useMarkRead } from './use-mark-read';

/**
 * Reading a thread brings the inbox's unread figures with it — without waiting for a socket event
 * that never comes when the socket is down.
 */

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function setup() {
  const client = testQueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

const reads = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/conversations/c1/read'));

describe('useMarkRead', () => {
  it('marks read and then refreshes the conversation list and the notifications', async () => {
    const { invalidate, wrapper } = setup();
    await renderHook(() => useMarkRead('c1', 'm1', true), { wrapper });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(reads()).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });

  it('reads nothing from a thread that is not in front or has nothing in it', async () => {
    const { wrapper } = setup();
    await renderHook(() => useMarkRead('c1', null, true), { wrapper });
    await renderHook(() => useMarkRead('c1', 'm1', false), { wrapper });
    expect(reads()).toHaveLength(0);
  });

  it('marks read again when a newer line arrives, and not on a re-render', async () => {
    const { wrapper } = setup();
    const hook = await renderHook(
      ({ newest }: { newest: string }) => useMarkRead('c1', newest, true),
      {
        wrapper,
        initialProps: { newest: 'm1' },
      },
    );
    await hook.rerender({ newest: 'm1' });
    await hook.rerender({ newest: 'm2' });
    await waitFor(() => expect(reads()).toHaveLength(2));
  });
});
