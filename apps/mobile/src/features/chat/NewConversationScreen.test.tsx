import type { MessagingScopeContact } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { NewConversationScreen } from './NewConversationScreen';

/**
 * Starting a direct message or a group from the phone.
 *
 * The list is the messaging directory — the same resolution the create endpoints enforce — so a
 * name shown is a name they accept. What is tested is that: the reason travels with each name, the
 * search reaches the server rather than filtering a roster held locally, each action sends the
 * request the API documents, and somebody with no reach is told why instead of shown an empty box.
 */

const fetchMock = jest.fn();

const RAVI = 'ravi-1';

const DIRECTORY: MessagingScopeContact[] = [
  {
    id: RAVI,
    name: 'Ravi K',
    email: 'ravi@example.com',
    reason: 'You manage the Acme portal project',
    conversationId: null,
  },
];

/** See `TaskActions.test.tsx`: a client that keeps nothing, so the jest worker can exit. */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function renderScreen(
  directory: MessagingScopeContact[] = DIRECTORY,
  onOpened = jest.fn(),
): Promise<RenderResult> {
  fetchMock.mockImplementation((input: unknown) => {
    const body = String(input).includes('/directory') ? directory : { id: 'new-conversation' };
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response);
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <NewConversationScreen onOpened={onOpened} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

/** The last request that changed something, with its method and body. */
function lastWrite(): { url: string; method: string; body: unknown } | null {
  for (let index = fetchMock.mock.calls.length - 1; index >= 0; index -= 1) {
    const [url, init] = fetchMock.mock.calls[index] as [unknown, RequestInit | undefined];
    if (init?.method && init.method !== 'GET') {
      return {
        url: String(url),
        method: init.method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
    }
  }
  return null;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('NewConversationScreen', () => {
  it('says why each person is reachable rather than listing names with no explanation', async () => {
    const view = await renderScreen();
    expect(await view.findByText('You manage the Acme portal project')).toBeTruthy();
  });

  it('searches on the server rather than filtering a roster it holds', async () => {
    const view = await renderScreen();
    await view.findByText('Ravi K');

    await fireEvent.changeText(view.getByLabelText('Find somebody'), 'Seema');

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('q=Seema'))).toBe(true),
    );
  });

  it('opens a direct message by naming the person, and hands back the conversation', async () => {
    const onOpened = jest.fn();
    const view = await renderScreen(DIRECTORY, onOpened);
    await fireEvent.press(await view.findByRole('button', { name: 'Message Ravi K' }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('new-conversation'));
    expect(lastWrite()).toEqual(
      expect.objectContaining({ method: 'POST', body: { userId: RAVI } }),
    );
    expect(lastWrite()?.url).toContain('/conversations/direct');
  });

  it('creates a group from the people chosen and the name given', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('button', { name: 'Add Ravi K to a group' }));
    await fireEvent.changeText(await view.findByLabelText('Group name'), 'Release crew');
    await fireEvent.press(view.getByRole('button', { name: 'Create the group' }));

    await waitFor(() => expect(lastWrite()?.url).toContain('/conversations/groups'));
    expect(lastWrite()?.body).toEqual({ title: 'Release crew', memberIds: [RAVI] });
  });

  it('will not create a group with no name', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('button', { name: 'Add Ravi K to a group' }));

    const create = await view.findByRole('button', { name: 'Create the group' });
    expect(create.props.accessibilityState.disabled).toBe(true);
  });

  it('tells somebody when the directory is empty', async () => {
    const view = await renderScreen([]);
    expect(await view.findByText('Nobody else here')).toBeTruthy();
  });
});
