import type { FileSummary, MessageSummary } from '@ashniva/types';
import { fireEvent, render, screen } from '@testing-library/react';

import { MessageItem } from './MessageItem';

/**
 * One line of a thread, and the controls it offers.
 *
 * `canEdit` and `canDelete` arrive **on the message**, from the server, per message — the edit
 * window closes on one line while the next is still fresh. So every test here is the same shape:
 * the server said this, and the line drew exactly that.
 *
 * The important one is withdrawal. There is no ordinary delete any more: `DELETE` refuses
 * everybody without `conversation:inspect`, the person who wrote the message included and with the
 * same answer a bystander gets. `canDelete` is therefore false for an ordinary reader, and the
 * absence of the button is what stops them being invited into a request the API would refuse — not
 * the control itself, which is the API's.
 */

const VIEWER = 'dev';
const SOMEBODY_ELSE = 'priya';

function message(over: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    sender: { id: SOMEBODY_ELSE, name: 'Priya S', email: 'priya@example.com' },
    body: 'Morning — is the sync fix ready to test?',
    systemKind: null,
    attachments: [],
    createdAt: '2026-09-13T09:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

function renderItem(
  over: Partial<MessageSummary> = {},
  continuesRun = false,
  extra: Partial<Parameters<typeof MessageItem>[0]> = {},
) {
  render(
    <ol>
      <MessageItem
        message={message(over)}
        viewerId={VIEWER}
        audience={[]}
        continuesRun={continuesRun}
        onEdit={vi.fn()}
        {...extra}
      />
    </ol>,
  );
}

function file(over: Partial<FileSummary> = {}): FileSummary {
  return {
    id: 'file-1',
    name: 'trace.log',
    contentType: 'text/plain',
    sizeBytes: 4096,
    visibility: 'INTERNAL',
    caption: null,
    uploadedBy: { id: SOMEBODY_ELSE, name: 'Priya S', email: 'priya@example.com' },
    createdAt: '2026-09-13T09:00:00.000Z',
    ...over,
  };
}

describe('MessageItem', () => {
  it('offers Edit on a message the server says may be changed', () => {
    renderItem({
      sender: { id: VIEWER, name: 'Dev One', email: 'dev@example.com' },
      canEdit: true,
    });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('offers nothing to withdraw with, to the person who wrote the message', () => {
    renderItem({
      sender: { id: VIEWER, name: 'Dev One', email: 'dev@example.com' },
      canEdit: true,
      canDelete: false,
    });
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('offers nothing at all on somebody else’s message', () => {
    renderItem();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  it('never offers a way to delete a message', () => {
    renderItem({ canEdit: false, canDelete: true });
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders a withdrawn message as a tombstone with nothing to press', () => {
    renderItem({ body: '', deletedAt: '2026-09-13T10:00:00.000Z' });
    const tombstone = screen.getByText('Message deleted');
    expect(tombstone.closest('li')).toHaveClass('chat-message--deleted');
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  it('marks the viewer’s own line so a thread can be read at a glance', () => {
    renderItem({ sender: { id: VIEWER, name: 'Dev One', email: 'dev@example.com' }, body: 'Mine' });
    expect(screen.getByText('Mine').closest('li')).toHaveClass('chat-message--mine');
  });

  it('drops the repeated name on a line that continues a run, and keeps the time', () => {
    renderItem({ body: 'Still me' }, true);
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
    expect(screen.getByText('Still me').closest('li')).toHaveClass('chat-message--continued');
  });

  it('keeps saying "edited" on a continued line, where the head is gone', () => {
    renderItem({ body: 'Rewritten', editedAt: '2026-09-13T09:05:00.000Z' }, true);
    expect(screen.getByText(/edited/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------------------------
  // The bubble
  // -------------------------------------------------------------------------------------------

  it('puts somebody else’s line on the other side from the viewer’s own', () => {
    renderItem({ body: 'Theirs' });
    expect(screen.getByText('Theirs').closest('li')).toHaveClass('chat-message--theirs');
    expect(screen.getByText('Theirs').closest('li')).not.toHaveClass('chat-message--mine');
  });

  it('drops the sender’s name in a one-to-one thread, where the side already says who wrote it', () => {
    renderItem({ body: 'Theirs' }, false, { showSenderName: false });
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
    expect(screen.getByText('Theirs')).toBeInTheDocument();
  });

  it('draws the unread line above the first message the reader had not seen', () => {
    renderItem({ body: 'First new one' }, false, { startsUnread: true });
    expect(screen.getByText('New messages')).toBeInTheDocument();
  });

  it('marks what an in-thread search was looking for', () => {
    renderItem({ body: 'the sync fix is ready' }, false, { highlight: 'sync' });
    expect(screen.getByText('sync').tagName).toBe('MARK');
  });

  // -------------------------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------------------------

  it('names a non-image attachment and its size', () => {
    renderItem({ attachments: [file()] });
    const button = screen.getByRole('button', { name: /trace\.log/ });
    expect(button).toHaveTextContent('4 KB');
  });

  it('shows an image attachment as an image rather than as a filename', () => {
    // The bytes are fetched with the bearer token and handed over as an object URL, so there is
    // nothing to render until that resolves — what matters here is that it is an image control
    // rather than a download row.
    renderItem({
      attachments: [file({ id: 'file-2', name: 'shot.png', contentType: 'image/png' })],
    });
    expect(screen.getByRole('button', { name: 'Download shot.png' })).toHaveClass(
      'chat-message__image',
    );
  });

  // -------------------------------------------------------------------------------------------
  // Reply
  // -------------------------------------------------------------------------------------------

  it('offers Reply only where the caller passed a way to reply', () => {
    const onReply = vi.fn();
    renderItem({ body: 'Answer me' }, false, { onReply });

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ body: 'Answer me' }));
  });

  it('offers no Reply where the server said this person may not post', () => {
    // `onReply` is only passed when `abilities.canPost` is true, so the absence here is the
    // absence of a control that would have produced a request the API refuses.
    renderItem({ body: 'Read only' });
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });
});
