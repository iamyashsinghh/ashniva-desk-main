import type { MessageSummary } from '@ashniva/types';
import { fireEvent, render, screen } from '@testing-library/react';

import { MessageThread } from './MessageThread';

/**
 * The thread's shape: days, runs, and the control that reaches further back.
 *
 * A presentational component with no requests of its own, so it is rendered directly rather than
 * through the panel — the panel's own spec is about assembling the server's answers, and testing
 * where a date heading falls through four stubbed endpoints would prove less and break more.
 */

const PRIYA = { id: 'priya', name: 'Priya S', email: 'priya@example.com' };
const DEV = { id: 'dev', name: 'Dev One', email: 'dev@example.com' };

function message(over: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    conversationId: 'conversation-1',
    sender: PRIYA,
    body: 'Something',
    systemKind: null,
    attachments: [],
    createdAt: at('2026-09-13T09:00:00'),
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

/** A local time, so the assertions do not depend on the timezone the tests happen to run in. */
function at(local: string): string {
  return new Date(local).toISOString();
}

function renderThread(
  messages: MessageSummary[],
  over: { hasEarlier?: boolean; firstUnreadId?: string } = {},
) {
  const onLoadEarlier = vi.fn();
  render(
    <MessageThread
      messages={messages}
      viewerId={DEV.id}
      audience={[]}
      hasEarlier={over.hasEarlier ?? false}
      isLoadingEarlier={false}
      onLoadEarlier={onLoadEarlier}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...(over.firstUnreadId ? { firstUnreadId: over.firstUnreadId } : {})}
    />,
  );
  return { onLoadEarlier };
}

describe('MessageThread', () => {
  it('gives each day of a thread its own section and heading', () => {
    renderThread([
      message({ id: 'a', body: 'Older', createdAt: at('2026-08-04T09:00:00') }),
      message({ id: 'b', body: 'Newer', createdAt: at('2026-08-11T09:00:00') }),
    ]);

    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByRole('region', { name: '04 Aug' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '11 Aug' })).toBeInTheDocument();
  });

  it('names today and yesterday rather than dating them', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    renderThread([
      message({ id: 'a', body: 'Older', createdAt: yesterday.toISOString() }),
      message({ id: 'b', body: 'Newer', createdAt: now.toISOString() }),
    ]);

    expect(screen.getByRole('region', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument();
  });

  it('prints one name for a run of consecutive lines from the same person', () => {
    renderThread([
      message({ id: 'a', body: 'First', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', body: 'Second', createdAt: at('2026-09-13T09:01:00') }),
      message({ id: 'c', body: 'Third', createdAt: at('2026-09-13T09:02:00') }),
    ]);

    expect(screen.getAllByText('Priya S')).toHaveLength(1);
    expect(screen.getByText('Second').closest('li')).toHaveClass('chat-message--continued');
  });

  it('starts a fresh run when somebody else speaks', () => {
    renderThread([
      message({ id: 'a', body: 'Hers', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', body: 'His', sender: DEV, createdAt: at('2026-09-13T09:01:00') }),
      message({ id: 'c', body: 'Hers again', createdAt: at('2026-09-13T09:02:00') }),
    ]);

    // Two runs from Priya either side of Dev's line, each carrying her name again.
    expect(screen.getAllByText('Priya S')).toHaveLength(2);
    expect(screen.getByText('His').closest('li')).not.toHaveClass('chat-message--continued');
  });

  it('offers a way back into the history only while the server says there is more', () => {
    const { onLoadEarlier } = renderThread([message({ id: 'a' })], { hasEarlier: true });
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));
    expect(onLoadEarlier).toHaveBeenCalled();
  });

  it('does not offer one when the thread is complete', () => {
    renderThread([message({ id: 'a' })]);
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('draws the unread divider once, above the line the reader had not reached', () => {
    renderThread(
      [
        message({ id: 'a', body: 'Read already', createdAt: at('2026-09-13T09:00:00') }),
        message({ id: 'b', body: 'Not yet read', createdAt: at('2026-09-13T09:01:00') }),
        message({ id: 'c', body: 'Nor this', createdAt: at('2026-09-13T09:02:00') }),
      ],
      { firstUnreadId: 'b' },
    );

    const dividers = screen.getAllByText('New messages');
    expect(dividers).toHaveLength(1);
    expect(dividers[0]?.closest('li')).toHaveTextContent('Not yet read');
  });

  it('starts a fresh head on the divided line, so the name is not lost to the run above it', () => {
    // "b" continues Priya's run, but it is also where the divider goes — a line under a "New
    // messages" rule with no name above it inside the run reads as coming from nobody.
    renderThread(
      [
        message({ id: 'a', body: 'Read already', createdAt: at('2026-09-13T09:00:00') }),
        message({ id: 'b', body: 'Not yet read', createdAt: at('2026-09-13T09:01:00') }),
      ],
      { firstUnreadId: 'b' },
    );

    expect(screen.getByText('Not yet read').closest('li')).not.toHaveClass(
      'chat-message--continued',
    );
  });

  it('announces an incoming line from somebody else, politely and once', () => {
    renderThread([
      message({ id: 'a', body: 'Mine', sender: DEV, createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', body: 'Theirs', createdAt: at('2026-09-13T09:01:00') }),
    ]);

    expect(screen.getByRole('status')).toHaveTextContent('Priya S: Theirs');
  });

  it('does not read the viewer’s own message back to them', () => {
    renderThread([message({ id: 'a', body: 'Mine', sender: DEV })]);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
