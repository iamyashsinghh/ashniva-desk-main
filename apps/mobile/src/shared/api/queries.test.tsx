import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, testQueryClient } from '../testing/harness';
import { usePagedResource } from './queries';

/**
 * Cursor paging, proved once for every list that uses it.
 *
 * Several screens read a paginated endpoint and only ever showed its first page, which looks
 * exactly like a short list — there is nothing on the screen to say the other four hundred rows
 * exist. `usePagedResource` is what fixes that, so this drives it directly: the flattening, the
 * cursor going back out on the next request, and the rule that a failure does not wipe what is
 * already on screen.
 *
 * Driving the hook rather than a `FlatList` is deliberate: `onEndReached` needs a real layout,
 * which jest does not have, so a test that went through the list would be testing the mock.
 */

const fetchMock = jest.fn();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('a cursor-paged list', () => {
  it('asks for the next page with the cursor the API returned, and keeps the first', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a' }], nextCursor: 'a', total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'b' }], nextCursor: null, total: 1 }));

    const { result } = await renderHook(
      () => usePagedResource<{ id: string }>(['things'], '/things', { limit: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b']));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=a');
    expect(result.current.hasMore).toBe(false);
  });

  it('asks for nothing more once the API says there is no cursor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }], nextCursor: null, total: 1 }));

    const { result } = await renderHook(
      () => usePagedResource<{ id: string }>(['things'], '/things'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      result.current.loadMore();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the failure only while there is nothing to show instead', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'No' }, 500));

    const { result } = await renderHook(
      () => usePagedResource<{ id: string }>(['things'], '/things'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toEqual([]);
  });
});
