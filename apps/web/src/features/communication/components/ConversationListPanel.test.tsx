import { ROLE_KEYS, type ConversationSummary, type MessagingScopeContact } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { ConversationListPanel } from './ConversationListPanel';

/**
 * The conversation list.
 *
 * The properties worth holding: it finds people, it hides project channels, it lists colleagues
 * who have no thread yet, and it does not fan out per conversation.
 */

function summary(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    kind: 'SCOPE_DIRECT',
    title: 'Direct message',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'user-priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

const ROWS: ConversationSummary[] = [
  summary({ id: 'a' }),
  summary({
    id: 'b',
    kind: 'GROUP',
    title: 'Release crew',
    counterpart: null,
    unreadCount: 3,
    lastMessagePreview: 'Cutting the build tonight',
  }),
  summary({
    id: 'c',
    kind: 'PROJECT',
    title: 'Acme portal',
    counterpart: null,
    project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
  }),
];

const RAVI: MessagingScopeContact = {
  id: 'user-ravi',
  name: 'Ravi K',
  email: 'ravi@example.com',
  reason: 'In your organization',
  conversationId: null,
};

function renderList(
  rows: ConversationSummary[] = ROWS,
  over: {
    selectedId?: string;
    mentioned?: ReadonlySet<string>;
    directory?: MessagingScopeContact[];
    roleKey?: (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];
  } = {},
) {
  setAuthenticated('test-token', sessionUserFor(over.roleKey ?? ROLE_KEYS.PROJECT_MANAGER));
  const calls: string[] = [];
  const directory = over.directory ?? [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/conversations/directory')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => directory } as Response);
    }
    if (url.includes('/conversations/direct') && (init?.method ?? 'GET') === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          summary({
            id: 'new-dm',
            counterpart: { id: RAVI.id, name: RAVI.name, email: RAVI.email },
          }),
      } as Response);
    }
    const parsed = new URL(url, 'http://localhost');
    const kind = parsed.searchParams.get('kind');
    const limit = Number(parsed.searchParams.get('limit') ?? 50);
    const body = rows
      .filter((row) => (parsed.searchParams.get('unreadOnly') ? row.unreadCount > 0 : true))
      .filter((row) => (kind ? row.kind === kind : true))
      .slice(0, limit);
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ConversationListPanel
        onSelect={onSelect}
        {...(over.selectedId ? { selectedId: over.selectedId } : {})}
        {...(over.mentioned ? { mentioned: over.mentioned } : {})}
      />
    </QueryClientProvider>,
  );
  return { calls, onSelect };
}

describe('ConversationListPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws every row from the list request, without asking about each conversation', async () => {
    const { calls } = renderList();
    await screen.findByText('Release crew');

    expect(
      calls.filter((url) => /\/conversations\/(?!directory)[0-9a-z-]+($|\?)/.test(url)),
    ).toHaveLength(0);
  });

  it('hides project channels from Chats', async () => {
    renderList();
    await screen.findByText('Release crew');
    expect(screen.queryByText('Acme portal')).not.toBeInTheDocument();
  });

  it('hides people and the Direct chip for a developer, who only has the team group', async () => {
    renderList(ROWS, { directory: [RAVI], roleKey: ROLE_KEYS.DEVELOPER });
    expect(await screen.findByText('Release crew')).toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
    expect(screen.queryByText('Ravi K')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Direct' })).not.toBeInTheDocument();
  });

  it('lists colleagues who have no thread yet', async () => {
    renderList(ROWS, { directory: [RAVI] });
    expect(await screen.findByText('Ravi K')).toBeInTheDocument();
    expect(screen.getByText('In your organization')).toBeInTheDocument();
  });

  it('opens a direct message when a colleague with no thread is chosen', async () => {
    const { onSelect, calls } = renderList(ROWS, { directory: [RAVI] });
    fireEvent.click(await screen.findByText('Ravi K'));

    await waitFor(() =>
      expect(calls.some((url) => url.endsWith('/conversations/direct'))).toBe(true),
    );
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-dm' })),
    );
  });

  it('does not duplicate a colleague who already has a thread', async () => {
    renderList(ROWS, {
      directory: [
        {
          id: 'user-priya',
          name: 'Priya S',
          email: 'priya@example.com',
          reason: 'In your organization',
          conversationId: 'a',
        },
      ],
    });
    await screen.findByText('Priya S');
    expect(screen.getAllByText('Priya S')).toHaveLength(1);
  });

  it('shows the unread count on the conversations that have one', async () => {
    renderList();
    expect(await screen.findByLabelText('3 unread')).toHaveTextContent('3');
  });

  it('finds a conversation by name and by preview', async () => {
    renderList();
    await screen.findByText('Release crew');

    fireEvent.change(screen.getByLabelText('Search your conversations'), {
      target: { value: 'tonight' },
    });
    expect(screen.getByText('Release crew')).toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
  });

  it('asks the server for unread conversations rather than filtering the page it holds', async () => {
    const { calls } = renderList();
    await screen.findByText('Release crew');

    fireEvent.click(screen.getByRole('radio', { name: /Unread/ }));

    await waitFor(() => expect(calls.some((url) => url.includes('unreadOnly=true'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('Priya S')).not.toBeInTheDocument());
  });

  it('hands the whole summary back when a conversation is chosen', async () => {
    const { onSelect } = renderList();
    fireEvent.click(await screen.findByText('Release crew'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', kind: 'GROUP' }));
  });

  it('asks the server for groups rather than filtering the page it holds', async () => {
    const { calls } = renderList();
    await screen.findByText('Release crew');

    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));

    await waitFor(() => expect(calls.some((url) => url.includes('kind=GROUP'))).toBe(true));
    expect(screen.getByText('Release crew')).toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
  });

  it('treats both direct kinds as one filter, which no single kind parameter can ask for', async () => {
    const { calls } = renderList([
      ...ROWS,
      summary({
        id: 'd',
        kind: 'DIRECT',
        counterpart: { id: 'user-arun', name: 'Arun M', email: 'arun@example.com' },
      }),
    ]);
    await screen.findByText('Release crew');

    fireEvent.click(screen.getByRole('radio', { name: 'Direct' }));

    await waitFor(() => expect(screen.queryByText('Release crew')).not.toBeInTheDocument());
    expect(screen.getByText('Priya S')).toBeInTheDocument();
    expect(screen.getByText('Arun M')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('kind='))).toBe(false);
  });

  it('does not let a kind chip change what the Unread badge counts', async () => {
    renderList();
    await screen.findByText('Release crew');
    const unreadChip = () => screen.getByRole('radio', { name: /^Unread/ });

    expect(unreadChip()).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    await waitFor(() => expect(screen.getByText('Release crew')).toBeInTheDocument());
    expect(unreadChip()).toHaveTextContent(/^Unread$/);

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(unreadChip()).toHaveTextContent('3'));
  });

  it('keeps the Unread badge under the chips that do not narrow the window by kind', async () => {
    renderList([
      ...ROWS,
      summary({
        id: 'd',
        kind: 'DIRECT',
        counterpart: { id: 'user-arun', name: 'Arun M', email: 'arun@example.com' },
      }),
    ]);
    await screen.findByText('Release crew');
    const unreadChip = () => screen.getByRole('radio', { name: /^Unread/ });

    fireEvent.click(screen.getByRole('radio', { name: 'Direct' }));
    await waitFor(() => expect(screen.queryByText('Release crew')).not.toBeInTheDocument());
    expect(unreadChip()).toHaveTextContent('3');
  });

  it('marks the open conversation so it can be found at a glance', async () => {
    renderList(ROWS, { selectedId: 'b' });
    const row = await screen.findByText('Release crew');

    expect(row.closest('button')).toHaveClass('chat-list__conversation--selected');
    expect(row.closest('button')).toHaveAttribute('aria-current', 'true');
  });

  it('marks a conversation where an unread notification says the viewer was named', async () => {
    renderList(ROWS, { mentioned: new Set(['b']) });
    await screen.findByText('Release crew');

    expect(screen.getByLabelText('You were mentioned')).toBeInTheDocument();
  });

  it('marks nothing when no unread mention names the viewer', async () => {
    renderList();
    await screen.findByText('Release crew');

    expect(screen.queryByLabelText('You were mentioned')).not.toBeInTheDocument();
  });

  it('offers more only while the page it asked for came back full', async () => {
    renderList();
    await screen.findByText('Release crew');
    expect(
      screen.queryByRole('button', { name: 'Show more conversations' }),
    ).not.toBeInTheDocument();
  });
});
