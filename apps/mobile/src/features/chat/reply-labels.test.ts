import type { MessageReplyRef } from '@ashniva/types';

import { attachmentHint, quoteContent, quotedSender } from './reply-labels';

const PRIYA = { id: 'priya', name: 'Priya S', email: 'priya@example.com' };

function ref(over: Partial<MessageReplyRef> = {}): MessageReplyRef {
  return {
    id: 'm1',
    sender: PRIYA,
    bodyPreview: 'Can you check the build?',
    attachmentCount: 0,
    deleted: false,
    unavailable: false,
    ...over,
  };
}

describe('attachmentHint', () => {
  it('says nothing about a message with no files', () => {
    expect(attachmentHint(0)).toBeNull();
  });

  it('calls pictures photos when the files are in hand', () => {
    const photo = { name: 'a.jpg', contentType: 'image/jpeg' };
    expect(attachmentHint(1, [photo])?.label).toBe('Photo');
    expect(attachmentHint(2, [photo, photo])?.label).toBe('2 photos');
  });

  it('names a single document, and only counts when that is all it knows', () => {
    expect(attachmentHint(1, [{ name: 'spec.pdf', contentType: 'application/pdf' }])?.label).toBe(
      'spec.pdf',
    );
    expect(attachmentHint(1)?.label).toBe('Attachment');
    expect(attachmentHint(3)?.label).toBe('3 attachments');
  });
});

describe('quoteContent', () => {
  it('quotes the preview with mention tokens written as names', () => {
    const dev = '22222222-2222-4222-8222-222222222222';
    const names = new Map([[dev, 'Dev One']]);
    const content = quoteContent(ref({ bodyPreview: `@[${dev}] can you\n check?` }), names);
    expect(content).toEqual({ kind: 'quote', text: '@Dev One can you check?', files: null });
  });

  it('still quotes a files-only message as something', () => {
    const content = quoteContent(ref({ bodyPreview: '', attachmentCount: 2 }), new Map());
    expect(content.kind === 'quote' ? content.files?.label : null).toBe('2 attachments');
  });

  it('says a withdrawn original was withdrawn, and a withheld one is unavailable', () => {
    expect(quoteContent(ref({ deleted: true, bodyPreview: '' }), new Map()).kind).toBe('withdrawn');
    expect(
      quoteContent(ref({ unavailable: true, deleted: true, sender: null }), new Map()).kind,
    ).toBe('unavailable');
  });
});

describe('quotedSender', () => {
  it('is “You” for the reader’s own line and the name for anybody else', () => {
    expect(quotedSender(ref({ sender: { ...PRIYA, id: 'me' } }), 'me')).toBe('You');
    expect(quotedSender(ref(), 'me')).toBe('Priya S');
    expect(quotedSender(ref({ sender: null }), 'me')).toBe('Somebody');
  });
});
