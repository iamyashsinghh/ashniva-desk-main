import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { MessageComposer } from './MessageComposer';

/**
 * Writing a message.
 *
 * The composer was a single-line `<input>` with no length limit, no counter, no way to attach a
 * file and no way to write a mention — while the server enforced a four-thousand-character limit,
 * accepted attachment ids, and dispatched notifications on a `@[uuid]` grammar nothing produced.
 *
 * The picker's own behaviour lives in `MessageComposerMentions.test.tsx`, because it is a second
 * subject: who the server says may be named here, rather than what happens to a draft.
 */

const CONVERSATION = 'c1e6f0a2-0e4a-4f1a-9a3c-2b7d8e9f0a11';
const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderComposer(over: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  render(
    wrap(
      <MessageComposer
        conversationId={CONVERSATION}
        canPost
        reason={null}
        onSend={onSend}
        {...over}
      />,
    ),
  );
  return { onSend, composer: screen.getByLabelText('Write a message') };
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

describe('MessageComposer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says so, rather than failing when pressed, when the server refused', () => {
    const { composer } = renderComposer({ canPost: false, reason: 'NOT_ON_PROJECT' });

    expect(composer).toBeDisabled();
    expect(composer).toHaveAttribute('placeholder', 'You cannot post here');
  });

  it('shows how much of the message limit has been used', () => {
    const { composer } = renderComposer();

    type(composer, 'hello');

    expect(screen.getByText('5 / 4000')).toBeInTheDocument();
    expect(composer).toHaveAttribute('maxlength', '4000');
  });

  it('will not send an empty draft', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends on Enter', async () => {
    const { composer, onSend } = renderComposer();

    type(composer, 'ready for review');
    fireEvent.keyDown(composer, { key: 'Enter' });

    // `objectContaining` because every send now also carries a `clientMessageId`; what that key
    // has to do is its own test, further down.
    await vi.waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'ready for review', attachmentIds: [] }),
      ),
    );
  });

  it('does not send on shift+Enter, which is how a paragraph is written', () => {
    const { composer, onSend } = renderComposer();

    type(composer, 'first');
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears the draft once the message has gone', async () => {
    const { composer } = renderComposer();

    type(composer, 'sent');
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() => expect(composer).toHaveValue(''));
  });

  it('keeps the draft when the send is refused', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Chat is switched off'));
    render(
      wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
    );
    const composer = screen.getByLabelText('Write a message');

    type(composer, 'worth keeping');
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Chat is switched off');
    expect(composer).toHaveValue('worth keeping');
  });

  // -------------------------------------------------------------------------------------------
  // Retrying a send that failed
  // -------------------------------------------------------------------------------------------

  it('retries with the same client message id, so a retry cannot post twice', async () => {
    // The API returns the first message rather than posting a second one when it sees a
    // `clientMessageId` it has already stored. A key minted per attempt would defeat that exactly
    // when it matters — the send whose response was lost.
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network is down'))
      .mockResolvedValueOnce(undefined);
    render(
      wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
    );
    const composer = screen.getByLabelText('Write a message');

    type(composer, 'worth keeping');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    const [first, second] = onSend.mock.calls as [
      [{ clientMessageId: string }],
      [{ clientMessageId: string }],
    ];
    expect(second[0].clientMessageId).toBe(first[0].clientMessageId);
    expect(first[0].clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mints a fresh key for the next message once one has landed', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
    );
    const composer = screen.getByLabelText('Write a message');

    type(composer, 'first');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await vi.waitFor(() => expect(composer).toHaveValue(''));

    type(composer, 'second');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    const [first, second] = onSend.mock.calls as [
      [{ clientMessageId: string }],
      [{ clientMessageId: string }],
    ];
    expect(second[0].clientMessageId).not.toBe(first[0].clientMessageId);
  });

  it('mints a new key when the draft is edited after a failed send, so a revision is not discarded', async () => {
    // The failure the key exists to survive is the one where the row landed and the response did
    // not. Holding the key across an edit turned that safeguard into a way to lose words: the
    // server recognises the key, answers with the *first* body, and the 2xx makes the composer
    // clear the box — the revised text gone with nothing saying so. Mobile already mints a new key
    // on every keystroke; this is web converging on it.
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network is down'))
      .mockResolvedValueOnce(undefined);
    render(
      wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
    );
    const composer = screen.getByLabelText('Write a message');

    type(composer, 'the first wording');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByRole('alert');

    type(composer, 'the REVISED wording');
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    const [first, second] = onSend.mock.calls as [
      [{ body: string; clientMessageId: string }],
      [{ body: string; clientMessageId: string }],
    ];
    expect(second[0].body).toBe('the REVISED wording');
    expect(second[0].clientMessageId).not.toBe(first[0].clientMessageId);
    expect(second[0].clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mints a new key when a file is attached after a failed send', async () => {
    // The files are part of the draft, and the failure is the sharper version of the word case:
    // the first send landed and adopted nothing, the sender adds the file they meant to include,
    // and the reused key returns the original message — without the attachment, and with a 2xx
    // that clears the strip.
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network is down'))
      .mockResolvedValueOnce(undefined);
    const uploaded = {
      id: 'a3c8499f-7b6a-47c6-bbf2-f7ca59bfef1f',
      name: 'evidence.pdf',
      contentType: 'application/pdf',
      sizeBytes: 12,
      visibility: 'INTERNAL',
      uploadedBy: null,
      createdAt: '2026-09-13T09:00:00.000Z',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => uploaded,
      text: async () => JSON.stringify(uploaded),
      headers: { get: () => 'application/json' },
    } as unknown as Response);
    render(
      wrap(<MessageComposer conversationId={CONVERSATION} canPost reason={null} onSend={onSend} />),
    );
    const composer = screen.getByLabelText('Write a message');

    type(composer, 'with the file');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText('Choose a file to attach'), {
      target: { files: [new File(['x'], 'evidence.pdf', { type: 'application/pdf' })] },
    });
    // The precondition: the file really did attach. Without this the assertion below would pass
    // just as well against an upload that failed and left the draft untouched.
    expect(await screen.findByText('evidence.pdf')).toBeInTheDocument();

    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    const [first, second] = onSend.mock.calls as [
      [{ attachmentIds: string[]; clientMessageId: string }],
      [{ attachmentIds: string[]; clientMessageId: string }],
    ];
    expect(first[0].attachmentIds).toEqual([]);
    expect(second[0].attachmentIds).toEqual([uploaded.id]);
    expect(second[0].clientMessageId).not.toBe(first[0].clientMessageId);
  });

  // -------------------------------------------------------------------------------------------
  // Replying
  // -------------------------------------------------------------------------------------------

  it('shows what is being replied to, and addresses that person when it is sent', async () => {
    // There is no `replyToId` in the contract, so a reply is delivered as a mention — the only
    // form of "this is for you" inside a shared thread that the notification path carries.
    const onSend = vi.fn().mockResolvedValue(undefined);
    const replyingTo = {
      id: 'message-1',
      conversationId: 'conversation-1',
      sender: { id: PRIYA, name: 'Priya S', email: 'priya@example.com' },
      body: 'Is the sync fix ready?',
      systemKind: null,
      attachments: [],
      createdAt: '2026-09-13T09:00:00.000Z',
      editedAt: null,
      deletedAt: null,
      canEdit: false,
      canDelete: false,
    };
    render(
      wrap(
        <MessageComposer
          conversationId={CONVERSATION}
          canPost
          reason={null}
          replyingTo={replyingTo}
          onCancelReply={vi.fn()}
          onSend={onSend}
        />,
      ),
    );
    const composer = screen.getByLabelText('Write a message');

    expect(screen.getByText('Replying to Priya S')).toBeInTheDocument();
    expect(screen.getByText('Is the sync fix ready?')).toBeInTheDocument();

    type(composer, 'yes, on staging');
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: `@[${PRIYA}] yes, on staging` }),
      ),
    );
  });
});
