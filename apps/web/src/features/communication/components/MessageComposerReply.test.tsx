import type { MessageSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

import { MessageComposer } from './MessageComposer';

/**
 * Replying to one line of a thread.
 *
 * A reply names the message it answers (`replyToId`) and the server tells that message's sender,
 * the way it tells somebody mentioned — so the composer no longer writes a mention of them into
 * the body. What is sent is exactly what was typed.
 */

const CONVERSATION = 'c1e6f0a2-0e4a-4f1a-9a3c-2b7d8e9f0a11';
const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const DEV = '8a0c4f2d-1b3e-4c5d-9e6f-7a8b9c0d1e2f';

function replyTarget(over: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    sender: { id: PRIYA, name: 'Priya S', email: 'priya@example.com' },
    body: 'Is the sync fix ready?',
    systemKind: null,
    attachments: [],
    createdAt: '2026-09-13T09:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    restrictedToUserIds: [],
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

function renderComposer(over: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MessageComposer
        conversationId={CONVERSATION}
        canPost
        reason={null}
        onSend={onSend}
        {...over}
      />
    </QueryClientProvider>,
  );
  return { onSend, composer: screen.getByLabelText('Write a message') };
}

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  (element as HTMLTextAreaElement).setSelectionRange(value.length, value.length);
}

describe('MessageComposer replies', () => {
  it('quotes what is being replied to, and sends the reply by id without tagging anybody', async () => {
    const { composer, onSend } = renderComposer({
      replyingTo: replyTarget({ body: `@[${DEV}] is the sync fix ready?` }),
      onCancelReply: vi.fn(),
      audience: [{ id: DEV, name: 'Dev One', email: 'dev@example.com', projectRole: null }],
    });

    expect(screen.getByText('Replying to Priya S')).toBeInTheDocument();
    // Mentions in the quoted line read as names, the way the thread renders them.
    expect(screen.getByText('@Dev One')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(DEV))).not.toBeInTheDocument();

    type(composer, 'yes, on staging');
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'yes, on staging', replyToId: 'message-1' }),
      ),
    );
  });

  it('sends no reply id when nothing is being replied to', async () => {
    const { composer, onSend } = renderComposer();

    type(composer, 'standalone');
    fireEvent.keyDown(composer, { key: 'Enter' });

    await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0]?.[0]).not.toHaveProperty('replyToId');
  });

  it('says a photo is being replied to when the line carried only a picture', () => {
    renderComposer({
      replyingTo: replyTarget({
        body: '',
        attachments: [
          {
            id: 'file-1',
            name: 'screen.png',
            contentType: 'image/png',
            sizeBytes: 10,
            visibility: 'INTERNAL',
            caption: null,
            uploadedBy: { id: PRIYA, name: 'Priya S', email: 'priya@example.com' },
            createdAt: '2026-09-13T09:00:00.000Z',
          },
        ],
      }),
    });

    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('cancels the reply from the bar', () => {
    const onCancelReply = vi.fn();
    renderComposer({ replyingTo: replyTarget(), onCancelReply });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel this reply' }));

    expect(onCancelReply).toHaveBeenCalled();
  });
});
