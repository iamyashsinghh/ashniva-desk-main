import type { MessageReplyRef } from '@ashniva/types';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ReplyQuote } from './ReplyQuote';

const PRIYA = { id: 'priya', name: 'Priya S', email: 'priya@example.com' };

function ref(over: Partial<MessageReplyRef> = {}): MessageReplyRef {
  return {
    id: 'original',
    sender: PRIYA,
    bodyPreview: 'Can you check the build?',
    attachmentCount: 0,
    deleted: false,
    unavailable: false,
    ...over,
  };
}

function renderQuote(replyTo: MessageReplyRef, onPress?: (id: string) => void) {
  return render(
    <ThemeProvider>
      <ReplyQuote
        replyTo={replyTo}
        names={new Map()}
        viewerId="me"
        onBrand={false}
        onPress={onPress}
      />
    </ThemeProvider>,
  );
}

describe('ReplyQuote', () => {
  it('names the sender, quotes the words, and goes to the original when tapped', async () => {
    const onPress = jest.fn();
    await renderQuote(ref(), onPress);

    expect(screen.getByText('Priya S')).toBeTruthy();
    expect(screen.getByText('Can you check the build?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reply-quote'));
    expect(onPress).toHaveBeenCalledWith('original');
  });

  it('says a withdrawn original was withdrawn rather than quoting nothing', async () => {
    await renderQuote(ref({ deleted: true, bodyPreview: '' }));
    expect(screen.getByText('This message was withdrawn')).toBeTruthy();
  });

  it('shows nothing of an original withheld from this reader, and cannot be opened', async () => {
    const onPress = jest.fn();
    await renderQuote(ref({ unavailable: true, sender: null, bodyPreview: '' }), onPress);

    expect(screen.getByText('Message unavailable')).toBeTruthy();
    expect(screen.queryByText('Priya S')).toBeNull();
    await fireEvent.press(screen.getByTestId('reply-quote'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('still quotes a line that was only files', async () => {
    await renderQuote(ref({ bodyPreview: '', attachmentCount: 1 }));
    expect(screen.getByText('Attachment')).toBeTruthy();
  });
});
