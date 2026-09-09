import type { MentionableUser } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Mock } from 'vitest';

import { ApiError } from '../../../shared/lib/api-client';
import type { SendMessageDraft } from './composer-send';
import { MessageComposer } from './MessageComposer';

/**
 * Writing a mention.
 *
 * The picker is the server's answer rather than a locally filtered roster, and it has to be: the
 * send path refuses a message naming somebody outside the conversation, so a picker that offered
 * a name from anywhere else would be offering a request the API rejects. Every test here stubs
 * `GET /conversations/:id/mentionable` and asserts against what it returned.
 */

const CONVERSATION = 'c1e6f0a2-0e4a-4f1a-9a3c-2b7d8e9f0a11';
const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const SAM = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';

const MENTIONABLE: MentionableUser[] = [
  {
    userId: PRIYA,
    name: 'Priya S',
    email: 'priya@example.com',
    roleName: 'Team lead',
    contextLabel: 'On ACME',
  },
  // An address that shares nothing with the display name, so "matches on the email" can be
  // asserted rather than accidentally satisfied by the name.
  {
    userId: SAM,
    name: 'Sam T',
    email: 'riley@example.com',
    roleName: 'Tester',
    contextLabel: null,
  },
];

/**
 * Answers the mentionable endpoint the way the server does: filtered on name or email.
 *
 * The filtering is the *server's* job, so the stub does it — a stub that returned everybody would
 * let a component that filtered locally pass a test the real endpoint would fail.
 */
function stubMentionable(people: MentionableUser[] = MENTIONABLE) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.search);
    const term = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = people.filter(
      (person) =>
        term.length === 0 ||
        person.name.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term),
    );
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ items }) } as Response);
  });
  return calls;
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Typed rather than a bare `vi.fn()`, so a test asserting on a call sees the draft's real shape. */
type SendMock = Mock<(input: SendMessageDraft) => Promise<void>>;

function sendMock(): SendMock {
  return vi.fn<(input: SendMessageDraft) => Promise<void>>();
}

function renderComposer(onSend: SendMock = sendMock()) {
  render(
    wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
  );
  return { onSend, composer: screen.getByLabelText('Write a message') };
}

/** The 400 `assertMentionsAreReachable` answers with, as the API client delivers it. */
function unreachableMention(): ApiError {
  return new ApiError(
    400,
    {
      statusCode: 400,
      error: 'Bad Request',
      message: 'You cannot mention somebody who is not in this conversation',
      timestamp: '2026-09-08T10:00:00.000Z',
    },
    'Bad Request',
  );
}

/**
 * Types into the composer, moving the caret with the text.
 *
 * The mention picker opens on the word being typed *before the caret*, so a helper that only set
 * `value` would leave the caret at zero and the picker would never see the `@`.
 */
function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  (element as HTMLTextAreaElement).setSelectionRange(value.length, value.length);
}

describe('MessageComposer mentions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the people the mentionable endpoint returned', async () => {
    stubMentionable();
    const { composer } = renderComposer();

    type(composer, '@');

    const picker = await screen.findByRole('listbox', { name: 'Mention somebody' });
    expect(picker).toHaveTextContent('Priya S');
    expect(picker).toHaveTextContent('Sam T');
    // The role and the short reason, which is what tells two people of the same name apart.
    expect(picker).toHaveTextContent('Team lead · On ACME');
  });

  it('asks the server to narrow rather than filtering the page it holds', async () => {
    const calls = stubMentionable();
    const { composer } = renderComposer();

    type(composer, '@priya');

    // The head of the audience is on screen first — that is the page the picker opens with, and
    // it stays there while the narrower term is fetched rather than blinking empty. What is
    // asserted is that the narrowing happens on the server and then arrives.
    await vi.waitFor(() => {
      expect(screen.getByRole('option', { name: /Priya S/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Sam T/ })).not.toBeInTheDocument();
    });
    // A project channel's audience is the project's staff; pulling all of them into the browser
    // to filter with `includes` is the query the endpoint exists to avoid.
    expect(calls.some((search) => search.includes('q=priya'))).toBe(true);
  });

  it('narrows on the email too, because two people can share a first name', async () => {
    stubMentionable();
    const { composer } = renderComposer();

    type(composer, '@riley');

    await vi.waitFor(() => {
      expect(screen.getByRole('option', { name: /Sam T/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Priya S/ })).not.toBeInTheDocument();
    });
  });

  it('writes the chosen person into the draft as an id, not as their name', async () => {
    stubMentionable();
    const { composer } = renderComposer();

    type(composer, 'hello @Pri');
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Priya S/ }));

    // The id, because a mention has to survive a rename and must not be forgeable by typing a
    // colleague's name into a line.
    expect(composer).toHaveValue(`hello @[${PRIYA}] `);
  });

  it('chooses the highlighted person with the keyboard, without the caret leaving the sentence', async () => {
    stubMentionable();
    const { composer, onSend } = renderComposer();

    type(composer, '@');
    await screen.findByRole('option', { name: /Priya S/ });

    // Down moves to the second name; Enter takes it rather than sending a half-written line.
    fireEvent.keyDown(composer, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Sam T/ })).toHaveAttribute('aria-selected', 'true');
    expect(composer).toHaveAttribute('aria-activedescendant', expect.stringContaining('-1'));

    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(composer).toHaveValue(`@[${SAM}] `);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends the mention as written rather than as it is displayed', async () => {
    stubMentionable();
    const { composer, onSend } = renderComposer();

    type(composer, '@Pri');
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Priya S/ }));
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: `@[${PRIYA}]`, attachmentIds: [] }),
      ),
    );
  });

  it('offers nobody when the server says nobody here matches', async () => {
    stubMentionable();
    const { composer } = renderComposer();

    type(composer, '@zzz');

    expect(await screen.findByText(/Nobody here matches/)).toBeInTheDocument();
  });

  it('does not open the picker on an email address', () => {
    stubMentionable();
    const { composer } = renderComposer();

    type(composer, 'write to priya@example.com');

    expect(screen.queryByRole('listbox', { name: 'Mention somebody' })).not.toBeInTheDocument();
  });

  it('closes the picker on Escape without sending anything', async () => {
    stubMentionable();
    const { composer, onSend } = renderComposer();

    type(composer, '@');
    expect(await screen.findByRole('listbox', { name: 'Mention somebody' })).toBeInTheDocument();

    fireEvent.keyDown(composer, { key: 'Escape' });

    expect(screen.queryByRole('listbox', { name: 'Mention somebody' })).not.toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });
});

/**
 * A mention that went stale between choosing it and sending.
 *
 * The realistic cause is somebody leaving the project in the seconds in between, and the server
 * refuses rather than dropping the mention quietly — which is right, but it means this is an
 * ordinary thing to survive rather than an error to shout about. The message is fine; only its
 * address is not.
 */
describe('MessageComposer when a mention is refused', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Writes "@Priya S are we still on for Thursday?" and sends it into a server that refuses. */
  async function sendRefusedMention(onSend: SendMock) {
    stubMentionable();
    const { composer } = renderComposer(onSend);

    type(composer, '@Pri');
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Priya S/ }));
    const withMention = (composer as HTMLTextAreaElement).value;
    type(composer, `${withMention}are we still on for Thursday?`);
    fireEvent.keyDown(composer, { key: 'Enter' });

    return { composer };
  }

  it('names who can no longer be mentioned, rather than repeating the API sentence', async () => {
    const onSend = sendMock().mockRejectedValue(unreachableMention());
    await sendRefusedMention(onSend);

    expect(await screen.findByText(/Priya S can no longer be mentioned here/)).toBeInTheDocument();
  });

  it('keeps every word that was typed', async () => {
    const onSend = sendMock().mockRejectedValue(unreachableMention());
    const { composer } = await sendRefusedMention(onSend);

    await screen.findByText(/can no longer be mentioned here/);
    expect((composer as HTMLTextAreaElement).value).toContain('are we still on for Thursday?');
  });

  it('offers to send it without the mention, and does not simply retry the same refusal', async () => {
    const onSend = sendMock().mockRejectedValue(unreachableMention());
    await sendRefusedMention(onSend);

    await screen.findByText(/can no longer be mentioned here/);
    expect(screen.getByRole('button', { name: 'Send without the mention' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('sends the same words with the mention written out as a name', async () => {
    const onSend = sendMock()
      .mockRejectedValueOnce(unreachableMention())
      .mockResolvedValueOnce(undefined);
    await sendRefusedMention(onSend);

    fireEvent.click(await screen.findByRole('button', { name: 'Send without the mention' }));

    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    const second = onSend.mock.calls[1]?.[0];
    expect(second?.body).toBe('@Priya S are we still on for Thursday?');
    expect(second?.body).not.toContain(PRIYA);
  });

  it('re-sends under the same key, because the refused attempt stored nothing', async () => {
    const onSend = sendMock()
      .mockRejectedValueOnce(unreachableMention())
      .mockResolvedValueOnce(undefined);
    await sendRefusedMention(onSend);

    fireEvent.click(await screen.findByRole('button', { name: 'Send without the mention' }));

    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    const first = onSend.mock.calls[0]?.[0];
    const second = onSend.mock.calls[1]?.[0];
    expect(second?.clientMessageId).toBe(first?.clientMessageId);
  });

  it('clears the box only once the rewritten message has actually landed', async () => {
    const onSend = sendMock()
      .mockRejectedValueOnce(unreachableMention())
      .mockResolvedValueOnce(undefined);
    const { composer } = await sendRefusedMention(onSend);

    fireEvent.click(await screen.findByRole('button', { name: 'Send without the mention' }));

    await vi.waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe(''));
  });

  it('offers a plain retry, not a rewrite, when the send failed for any other reason', async () => {
    const onSend = sendMock().mockRejectedValue(new Error('The network went away'));
    await sendRefusedMention(onSend);

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send without the mention' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer to strip mentions from a 400 about a message that has none', async () => {
    stubMentionable();
    const onSend = sendMock().mockRejectedValue(unreachableMention());
    const { composer } = renderComposer(onSend);

    type(composer, 'no mention in this one');
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send without the mention' }),
    ).not.toBeInTheDocument();
  });
});
