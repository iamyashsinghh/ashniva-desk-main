import type { MessageSummary, UserRef } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { MessageThread } from './MessageThread';

/**
 * A long press on a bubble, and a drag to the right: the phone's ways to the web's inline Reply
 * and Edit buttons. Reply is offered on any real line, the reader's own included — a reply quotes
 * the line rather than tagging its sender — and Edit only where the server said it may still be
 * edited.
 */

const PRIYA: UserRef = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Priya S',
  email: 'priya@example.com',
};
const DEV: UserRef = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Dev One',
  email: 'dev@example.com',
};

function message(over: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    conversationId: 'c1',
    sender: PRIYA,
    body: 'Can you check the build?',
    systemKind: null,
    attachments: [],
    createdAt: new Date('2026-09-13T09:00:00').toISOString(),
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    restrictedToUserIds: [],
    ...over,
  };
}

function thread(messages: MessageSummary[], onReply: jest.Mock) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <MessageThread
            messages={messages}
            viewerId={DEV.id}
            participants={[PRIYA, DEV]}
            showSenderNames
            unreadCount={0}
            hasEarlier={false}
            isLoadingEarlier={false}
            onLoadEarlier={jest.fn()}
            onReply={onReply}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

async function renderThread(messages: MessageSummary[], onReply = jest.fn()) {
  const view = await render(thread(messages, onReply));
  return { onReply, view };
}

const bubble = (text: string) => screen.getByLabelText(new RegExp(text));

describe('message actions', () => {
  it('replies to somebody else’s line from the long-press sheet', async () => {
    const theirs = message({ id: 'm1' });
    const { onReply } = await renderThread([theirs]);

    await fireEvent(bubble('check the build'), 'longPress');
    await fireEvent.press(screen.getByLabelText('Reply'));

    expect(onReply).toHaveBeenCalledWith(theirs);
  });

  it('offers Reply and Edit on the reader’s own editable line', async () => {
    const mine = message({ id: 'm2', sender: DEV, body: 'Shipping at six', canEdit: true });
    const { onReply } = await renderThread([mine]);

    await fireEvent(bubble('Shipping at six'), 'longPress');
    await fireEvent.press(screen.getByLabelText('Reply'));
    expect(onReply).toHaveBeenCalledWith(mine);

    await fireEvent(bubble('Shipping at six'), 'longPress');
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(screen.getAllByDisplayValue('Shipping at six').length).toBeGreaterThan(0);
  });

  it('offers a screen reader the same reply as an action on the bubble', async () => {
    const theirs = message({ id: 'm3' });
    const { onReply } = await renderThread([theirs]);

    await fireEvent(bubble('check the build'), 'accessibilityAction', {
      nativeEvent: { actionName: 'reply' },
    });

    expect(onReply).toHaveBeenCalledWith(theirs);
  });

  it('lets the reader swipe their own line to answer it, but not a withdrawn one', async () => {
    await renderThread([
      message({ id: 'm4', sender: DEV, body: 'Mine to swipe' }),
      message({ id: 'm5', body: '', deletedAt: '2026-09-13T09:05:00.000Z' }),
    ]);

    expect(screen.getAllByTestId('swipe-to-reply')).toHaveLength(1);
    expect(within(screen.getByTestId('swipe-to-reply')).getByText('Mine to swipe')).toBeTruthy();
  });

  it('keeps the swipe’s responder across a refetch that changes nothing about the line', async () => {
    const line = message({ id: 'm6' });
    const onReply = jest.fn();
    const { view } = await renderThread([line], onReply);
    const swipeOf = (text: string) =>
      screen
        .getAllByTestId('swipe-to-reply')
        .find((swipe) => within(swipe).queryByText(text) !== null);
    const before = swipeOf('Can you check the build?')?.props.onResponderMove as unknown;
    expect(before).toEqual(expect.any(Function));

    // A new line arriving re-renders every bubble; the unchanged one keeps its message object.
    await view.rerender(thread([line, message({ id: 'm7', body: 'Another' })], onReply));

    expect(swipeOf('Can you check the build?')?.props.onResponderMove).toBe(before);
  });

  it('quotes the line a reply answers, and says when the original was withdrawn', async () => {
    await renderThread([
      message({
        id: 'm8',
        sender: DEV,
        body: 'On it',
        replyTo: {
          id: 'm1',
          sender: PRIYA,
          bodyPreview: 'Can you check the build?',
          attachmentCount: 0,
          deleted: false,
          unavailable: false,
        },
      }),
      message({
        id: 'm9',
        body: 'Never mind',
        replyTo: {
          id: 'm0',
          sender: DEV,
          bodyPreview: '',
          attachmentCount: 0,
          deleted: true,
          unavailable: false,
        },
      }),
    ]);

    const quotes = screen.getAllByTestId('reply-quote');
    expect(quotes).toHaveLength(2);
    // The list is inverted, so which quote comes first in the tree is not the reading order.
    const quoting = (text: string) =>
      quotes.map((quote) => within(quote)).find((quote) => quote.queryByText(text) !== null);
    expect(quoting('Can you check the build?')?.getByText('Priya S')).toBeTruthy();
    expect(quoting('This message was withdrawn')?.getByText('You')).toBeTruthy();
  });
});
