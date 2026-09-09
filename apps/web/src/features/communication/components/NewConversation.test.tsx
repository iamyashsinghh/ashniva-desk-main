import { ROLE_KEYS, type MessagingScopeContact } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { NewConversation } from './NewConversation';

/**
 * Starting a direct message or a group.
 *
 * The picker offers the *messaging directory* — the same resolution the create endpoints enforce —
 * rather than the organization's roster, and the reason travels with each name. So the tests hold
 * that the search reaches the server, that each tab sends the request the API documents, and that
 * a developer, whose reach outside a project is empty, is told why instead of being shown an empty
 * box.
 */

const RAVI = 'b2c3d4e5-f607-4819-ab0c-2d3e4f506172';
const SEEMA = 'c3d4e5f6-0718-491a-bc0d-3e4f50617283';

const DIRECTORY: MessagingScopeContact[] = [
  {
    id: RAVI,
    name: 'Ravi K',
    email: 'ravi@example.com',
    reason: 'You manage the Acme portal project',
    conversationId: null,
  },
  {
    id: SEEMA,
    name: 'Seema R',
    email: 'seema@example.com',
    reason: 'You lead the Platform team',
    conversationId: null,
  },
];

/** The dialog reads three endpoints, so one canned body would make every assertion accidental. */
function bodyFor(url: string, directory: MessagingScopeContact[]): unknown {
  if (url.includes('/directory')) {
    return directory;
  }
  if (url.includes('/contacts')) {
    return [];
  }
  return { id: 'new-conversation' };
}

function renderDialog(directory: MessagingScopeContact[] = DIRECTORY) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const requests: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => bodyFor(url, directory),
    } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpened = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <NewConversation open onClose={vi.fn()} onOpened={onOpened} />
    </QueryClientProvider>,
  );
  return { requests, onOpened };
}

describe('NewConversation', () => {
  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('says why each person is reachable, rather than listing names with no explanation', async () => {
    renderDialog();
    expect(await screen.findByText(/You manage the Acme portal project/)).toBeInTheDocument();
  });

  it('searches on the server rather than filtering a roster it holds', async () => {
    const { requests } = renderDialog();
    await screen.findByText('Ravi K');

    fireEvent.change(screen.getByLabelText('Find somebody to message'), {
      target: { value: 'Seema' },
    });

    await waitFor(() =>
      expect(requests.some((request) => request.url.includes('q=Seema'))).toBe(true),
    );
  });

  it('opens a direct message by naming the person, and hands back the conversation', async () => {
    const { requests, onOpened } = renderDialog();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Message' }))[0] as HTMLElement);

    await waitFor(() => {
      const post = requests.find((request) => request.url.endsWith('/conversations/direct'));
      expect(post?.method).toBe('POST');
      expect(post?.body).toEqual({ userId: RAVI });
    });
    expect(onOpened).toHaveBeenCalledWith('new-conversation');
  });

  it('creates a group with a name and the people chosen for it', async () => {
    const { requests } = renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));

    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Release crew' } });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      const post = requests.find((request) => request.url.includes('/conversations/groups'));
      expect(post?.body).toEqual({ title: 'Release crew', memberIds: [RAVI] });
    });
  });

  it('refuses to create a group with no name and nobody in it', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    expect(screen.getByRole('button', { name: 'Create group' })).toBeDisabled();
  });

  it('tells somebody with no reach why the directory is empty', async () => {
    // A developer holds none of the relations that create reach, so the endpoint returns nothing.
    // An empty box with no explanation reads as a broken screen.
    renderDialog([]);
    expect(await screen.findByText('Nobody outside a project')).toBeInTheDocument();
  });
});
