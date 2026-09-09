import { ROLE_KEYS, type ConversationSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { ConversationListPanel } from './ConversationListPanel';

/**
 * The conversation list.
 *
 * The two properties worth holding are that it finds things and that it does not fan out: the row
 * is drawn entirely from the summary the list endpoint already returned, so however many
 * conversations somebody has, opening this screen is one request. A test that counted assertions
 * about layout would not catch a regression in either.
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

/** The panel's first page, mirrored here so a test can put a row behind it. */
const FIRST_WINDOW = 25;

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

/**
 * The endpoint, as far as this screen can tell: the filters it accepts, applied *before* the
 * window is cut. `rows` is newest-first, as the real one answers.
 */
function renderList(
  rows: ConversationSummary[] = ROWS,
  over: { selectedId?: string; mentioned?: ReadonlySet<string> } = {},
) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    calls.push(String(input));
    const url = new URL(String(input), 'http://localhost');
    const kind = url.searchParams.get('kind');
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const body = rows
      .filter((row) => (url.searchParams.get('unreadOnly') ? row.unreadCount > 0 : true))
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

  it('draws every row from the one list request, without asking about each conversation', async () => {
    const { calls } = renderList();
    await screen.findByText('Release crew');

    // The row shows a name, a preview and an unread count, all of which are already on the
    // summary. Fetching `/conversations/<id>` per row is exactly the N+1 the backend removed.
    expect(calls.filter((url) => /\/conversations\/[0-9a-z-]+($|\?)/.test(url))).toHaveLength(0);
  });

  it('shows the unread count on the conversations that have one', async () => {
    renderList();
    expect(await screen.findByLabelText('3 unread')).toHaveTextContent('3');
  });

  it('finds a conversation by name, by preview and by project code', async () => {
    renderList();
    await screen.findByText('Release crew');

    fireEvent.change(screen.getByLabelText('Search your conversations'), {
      target: { value: 'tonight' },
    });
    expect(screen.getByText('Release crew')).toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search your conversations'), {
      target: { value: 'ACM' },
    });
    expect(screen.getByText('Acme portal')).toBeInTheDocument();
    expect(screen.queryByText('Release crew')).not.toBeInTheDocument();
  });

  it('asks the server for unread conversations rather than filtering the page it holds', async () => {
    // Unread is a property of the whole list, not of the fifty rows that happen to be loaded.
    const { calls } = renderList();
    await screen.findByText('Release crew');

    // The filters are a single-choice chip set now, so "Unread" is a radio rather than a toggle.
    fireEvent.click(screen.getByRole('radio', { name: /Unread/ }));

    await waitFor(() => expect(calls.some((url) => url.includes('unreadOnly=true'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('Acme portal')).not.toBeInTheDocument());
  });

  it('hands the whole summary back when a conversation is chosen', async () => {
    // The kind travels with it, which is what lets the thread decide whether calling applies
    // before its own detail request has come back.
    const { onSelect } = renderList();
    fireEvent.click(await screen.findByText('Release crew'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', kind: 'GROUP' }));
  });

  // This used to assert the opposite — that a kind chip narrowed the page in hand and cost no
  // request. It was rewritten rather than dropped, because the saved request was buying a wrong
  // answer: the endpoint returns the most recent `limit` conversations of every kind, so a chip
  // applied afterwards narrows a window that was already spent on the kinds it is about to hide.
  it('asks the server for the kind rather than filtering the page it holds', async () => {
    const { calls } = renderList();
    await screen.findByText('Release crew');

    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));

    await waitFor(() => expect(calls.some((url) => url.includes('kind=GROUP'))).toBe(true));
    expect(screen.getByText('Release crew')).toBeInTheDocument();
    expect(screen.queryByText('Acme portal')).not.toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
  });

  it('shows a thread the unfiltered window would not have reached', async () => {
    // The bug this guards: one task thread behind a page full of newer group chatter. Filtering
    // the answer hides it; asking the server for `kind=TASK` does not.
    const newer = Array.from({ length: FIRST_WINDOW }, (_, index) =>
      summary({
        id: `g${index}`,
        kind: 'GROUP',
        title: `Group ${index}`,
        counterpart: null,
        lastMessageAt: '2026-09-13T09:00:00.000Z',
      }),
    );
    const behindThem = summary({
      id: 'task',
      kind: 'TASK',
      title: 'Sync fix',
      counterpart: null,
      task: { id: 'task-1', key: 'TK-42', title: 'Sync fix' },
      lastMessageAt: '2026-08-01T09:00:00.000Z',
    });

    renderList([...newer, behindThem]);
    await screen.findByText('Group 0');
    expect(screen.queryByText('Sync fix')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Task' }));

    expect(await screen.findByText('Sync fix')).toBeInTheDocument();
    expect(screen.queryByText('Group 0')).not.toBeInTheDocument();
  });

  it('treats both direct kinds as one filter, which no single kind parameter can ask for', async () => {
    // `kind` takes one value, so "Direct" is the one chip that still narrows in the browser:
    // asking for `kind=DIRECT` would quietly drop every `SCOPE_DIRECT` row.
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
    // The badge is summed over the window in hand, and since the chips began narrowing that window
    // on the server the window is no longer always every kind. Left alone it would have read "3"
    // under All and "0" under Task — the same figure meaning something else — so it is withheld
    // while a kind chip is active rather than answering a question nobody asked.
    renderList();
    await screen.findByText('Release crew');
    const unreadChip = () => screen.getByRole('radio', { name: /^Unread/ });

    expect(unreadChip()).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('radio', { name: 'Task' }));
    await waitFor(() => expect(screen.queryByText('Release crew')).not.toBeInTheDocument());
    expect(unreadChip()).toHaveTextContent(/^Unread$/);

    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    await waitFor(() => expect(screen.getByText('Release crew')).toBeInTheDocument());
    expect(unreadChip()).toHaveTextContent(/^Unread$/);

    // And it comes back unchanged the moment the window is every kind again.
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

    // "Direct" narrows in the browser and sends no `kind`, so the window is still every kind.
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
