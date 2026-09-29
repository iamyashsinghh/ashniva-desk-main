import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { CONVERSATION_FILTER } from './conversation-filters';
import { useConversationList } from './conversation-list-api';

/**
 * The inbox refetches on focus with `refresh` as its effect's dependency. A new function on every
 * render re-ran that effect on each state change its own refetch caused — a request loop for as
 * long as the tab was open.
 */

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(jsonResponse(String(url).includes('/notifications') ? { items: [] } : [])),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

let client = testQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useConversationList', () => {
  it('hands out the same refresh across renders, so a focus effect keyed on it runs once', async () => {
    client = testQueryClient();
    const hook = await renderHook(() => useConversationList(CONVERSATION_FILTER.ALL, ''), {
      wrapper,
    });
    const first = hook.result.current.refresh;

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await hook.rerender({});

    expect(hook.result.current.refresh).toBe(first);
  });
});
