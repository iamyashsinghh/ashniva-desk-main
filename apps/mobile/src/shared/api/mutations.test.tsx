import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { Button } from '../components/primitives';
import { ThemeProvider } from '../theme/ThemeProvider';
import { useApiMutation } from './mutations';

/**
 * The write helper.
 *
 * The error path is what these are mostly about. The whole reason the helper exists is that the
 * hand-rolled version left the spinner on after a failure often enough to be worth writing once —
 * so the assertions are that a refusal produces the API's own sentence, that `busy` comes back
 * down, that nothing is thrown at the caller, and that a failed write does not run the success
 * work or invalidate a cache that has not changed.
 */

const fetchMock = jest.fn();

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

/**
 * A client that keeps nothing after the screen goes away.
 *
 * `gcTime: 0` is not tidiness. React Query holds a finished mutation for its garbage-collection
 * window — five minutes by default — and schedules a real timer to drop it. A jest worker with one
 * of those outstanding does not exit, and the run ends in "a worker process has failed to exit
 * gracefully" instead of finishing.
 */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function wrap(children: ReactNode, client: QueryClient) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

let resolved: unknown;

function Writer({ onDone }: { onDone?: () => void }) {
  const save = useApiMutation<{ note: string }, { id: string }>({
    path: '/tasks/t1/block',
    body: (variables) => variables,
    invalidate: [['tasks']],
    ...(onDone ? { onSuccess: onDone } : {}),
  });

  return (
    <>
      <Button
        label="Save"
        loading={save.busy}
        onPress={() => {
          // Deliberately not wrapped in a try. If `run` ever rejects, this test throws an
          // unhandled rejection — which is exactly the failure the helper exists to prevent.
          void save.run({ note: 'blocked on credentials' }).then((result) => {
            resolved = result;
          });
        }}
      />
      <Text>{save.error ?? 'no error'}</Text>
    </>
  );
}

beforeEach(() => {
  resolved = undefined;
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('a write that succeeds', () => {
  it('sends the body, resolves with the result and invalidates what it named', async () => {
    const client = testClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const onDone = jest.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 't1' }));

    const view = await render(wrap(<Writer onDone={onDone} />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(resolved).toEqual({ id: 't1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ note: 'blocked on credentials' });
  });
});

describe('a write the API refuses', () => {
  it("shows the API's own sentence rather than a generic one", async () => {
    const client = testClient();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'This task is already in review',
        timestamp: '2026-09-07T10:00:00.000Z',
      }),
    );

    const view = await render(wrap(<Writer />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    expect(await view.findByText('This task is already in review')).toBeTruthy();
  });

  it('resolves with null rather than rejecting', async () => {
    const client = testClient();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { statusCode: 403, message: 'Not allowed' }));

    const view = await render(wrap(<Writer />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(resolved).toBeNull());
  });

  it('lets the button go again', async () => {
    // The bug the helper replaces: a spinner left running after a failure, on a button nobody can
    // press a second time.
    const client = testClient();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'Upstream is restarting' }));

    const view = await render(wrap(<Writer />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    await view.findByText('Upstream is restarting');
    await waitFor(() => {
      expect(view.getByRole('button', { name: 'Save' }).props.accessibilityState.busy).toBe(false);
    });
  });

  it('does not run the success work or invalidate anything', async () => {
    const client = testClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const onDone = jest.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { message: 'A reason is required' }));

    const view = await render(wrap(<Writer onDone={onDone} />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    await view.findByText('A reason is required');
    expect(onDone).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('says the network was the network', async () => {
    const client = testClient();
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const view = await render(wrap(<Writer />, client));
    await fireEvent.press(await view.findByRole('button', { name: 'Save' }));

    expect(await view.findByText('Could not reach the server')).toBeTruthy();
  });
});
