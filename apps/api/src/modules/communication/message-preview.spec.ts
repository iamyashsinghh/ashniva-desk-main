import { messagePreview } from './message-preview';

/**
 * What a message says when it is quoted away from its thread.
 *
 * This function is one of two things: the conversation list's `lastMessagePreview` and the line a
 * notification carries. They used to be six lines copied into two files, which was survivable
 * while the only rule was "mask the mentions and cut at 140". A message that can have no words at
 * all is what made the duplication untenable — the two copies would each have had to invent the
 * same sentence for it — so the behaviour is pinned here, once, for both callers.
 */

const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';

const file = (name: string) => ({ name });

describe('messagePreview', () => {
  it('quotes the words when there are words', () => {
    expect(messagePreview('Pushed the fix', [])).toBe('Pushed the fix');
  });

  it('masks a mention rather than leaking the id it is stored by', () => {
    // A raw uuid in a one-line quote reads as a leaked identifier rather than as somebody being
    // addressed, and neither caller has a roster to resolve it against.
    const line = messagePreview(`@[${PRIYA}] can you review this?`, []);
    expect(line).toBe('@someone can you review this?');
    expect(line).not.toContain(PRIYA);
  });

  it('flattens a message written over several lines into one', () => {
    expect(messagePreview('First line\n\n  second line ', [])).toBe('First line second line');
  });

  it('cuts a long message at 140 characters, ellipsis included', () => {
    const preview = messagePreview('x'.repeat(400), []);
    expect(preview).toHaveLength(140);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('leaves a message of exactly the limit alone', () => {
    expect(messagePreview('x'.repeat(140), [])).toBe('x'.repeat(140));
  });

  // -------------------------------------------------------------------------------------------
  // A message that is a file
  // -------------------------------------------------------------------------------------------

  it('names the file when a message has one and no words', () => {
    expect(messagePreview('', [file('quarterly-report.pdf')])).toBe('Sent quarterly-report.pdf');
  });

  it('counts the files when there are several, because the names stop being readable', () => {
    expect(messagePreview('', [file('one.pdf'), file('two.pdf'), file('three.pdf')])).toBe(
      'Sent 3 files',
    );
  });

  it('treats a whitespace-only body as no words at all', () => {
    // Which is what makes the API's three spellings of "no words" — `''`, `'  '` and an absent
    // body — read the same way in the list.
    expect(messagePreview('   ', [file('evidence.pdf')])).toBe('Sent evidence.pdf');
  });

  it('prefers the words when a message has both', () => {
    expect(messagePreview('Here it is', [file('evidence.pdf')])).toBe('Here it is');
  });

  it('never lets a long file name outgrow the limit', () => {
    const preview = messagePreview('', [file(`${'n'.repeat(400)}.pdf`)]);
    expect(preview).toHaveLength(140);
    expect(preview.startsWith('Sent ')).toBe(true);
  });

  it('does not name the sender, because both callers already do', () => {
    // The notification puts them in its title and the conversation list draws them as the row's
    // heading, so a name here would be said twice in both places.
    expect(messagePreview('', [file('report.pdf')])).not.toContain('Priya');
    expect(messagePreview('', [file('report.pdf')]).startsWith('Sent ')).toBe(true);
  });

  it('says nothing for a message carrying neither, rather than throwing', () => {
    // The send path refuses that message twice over — in the request, and again when a named
    // attachment turns out not to be adoptable — but a preview is not the place to raise over a
    // row that already exists.
    expect(messagePreview('', [])).toBe('');
  });
});
