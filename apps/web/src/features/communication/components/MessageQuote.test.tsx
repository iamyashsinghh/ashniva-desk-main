import type { MessageReplyRef } from '@ashniva/types';
import { fireEvent, render, screen } from '@testing-library/react';

import { MessageQuote } from './MessageQuote';

/**
 * The quote on a reply, drawn from `replyTo` exactly as the server built it for this reader —
 * including the two cases where it must say less than the original did.
 */

const PRIYA = { id: 'priya', name: 'Priya S', email: 'priya@example.com' };
// A mention is `@[uuid]`; anything that is not a uuid is left as text.
const DEV = {
  id: '8a0c4f2d-1b3e-4c5d-9e6f-7a8b9c0d1e2f',
  name: 'Dev One',
  email: 'dev@example.com',
  projectRole: null,
};

function quote(over: Partial<MessageReplyRef> = {}): MessageReplyRef {
  return {
    id: 'original-1',
    sender: PRIYA,
    bodyPreview: 'Is the sync fix ready?',
    attachmentCount: 0,
    deleted: false,
    unavailable: false,
    ...over,
  };
}

describe('MessageQuote', () => {
  it('shows who wrote the original and the start of it, with mentions as names', () => {
    render(
      <MessageQuote
        replyTo={quote({ bodyPreview: `@[${DEV.id}] can you check?` })}
        audience={[DEV]}
      />,
    );

    expect(screen.getByText('Priya S')).toBeInTheDocument();
    expect(screen.getByText('@Dev One')).toBeInTheDocument();
    expect(screen.getByText(/can you check\?/)).toBeInTheDocument();
  });

  it('counts the files of an original that had no words', () => {
    render(<MessageQuote replyTo={quote({ bodyPreview: '', attachmentCount: 3 })} audience={[]} />);
    expect(screen.getByText('3 attachments')).toBeInTheDocument();
  });

  it('says a withdrawn original was withdrawn, and still names who wrote it', () => {
    render(<MessageQuote replyTo={quote({ bodyPreview: '', deleted: true })} audience={[]} />);

    expect(screen.getByText('This message was withdrawn')).toBeInTheDocument();
    expect(screen.getByText('Priya S')).toBeInTheDocument();
  });

  it('says nothing about an original the reader may not see — not even who wrote it', () => {
    render(
      <MessageQuote
        replyTo={quote({ sender: null, bodyPreview: '', unavailable: true })}
        audience={[]}
      />,
    );

    expect(screen.getByText('Message unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Priya S')).not.toBeInTheDocument();
    // Nothing in their thread for it to lead to, so it is not offered as something to press.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('leads back to the original when pressed', () => {
    const onJump = vi.fn();
    render(<MessageQuote replyTo={quote()} audience={[]} onJump={onJump} />);

    fireEvent.click(screen.getByRole('button', { name: /Show the message from Priya S/ }));

    expect(onJump).toHaveBeenCalledWith('original-1');
  });
});
