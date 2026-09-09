import { maskMentions, mentionsIn, splitMentions } from './conversation';

/**
 * How a mention is written, read back and hidden.
 *
 * This grammar had been shipped with a notification path that dispatched on it, a masking rule
 * that depended on it, a composer that never produced it and no test at all. It is three
 * consumers' shared assumption, so it is tested here rather than through any one of them: the API
 * finds the ids to notify, the conversation list masks them, and the web renders them as names.
 *
 * The negative cases carry the weight. A mention is a *notification target*, and anything that
 * loosens this pattern hands the sender a way to point one at somebody — so "what is not a
 * mention" is the more important half of the contract.
 */

const ALICE = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const BOB = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';

describe('mentionsIn', () => {
  it('finds nothing in an ordinary message', () => {
    expect(mentionsIn('Pushed the fix, ready for review')).toEqual([]);
    expect(mentionsIn('')).toEqual([]);
  });

  it('finds one id, and returns the id rather than the whole match', () => {
    expect(mentionsIn(`@[${ALICE}] can you look at this?`)).toEqual([ALICE]);
  });

  it('finds several, anywhere in the line', () => {
    expect(mentionsIn(`@[${ALICE}] and @[${BOB}] — standup at ten`)).toEqual([ALICE, BOB]);
  });

  it('names somebody once however often they are mentioned', () => {
    // The caller notifies whoever this returns; a duplicate would be a second notification for
    // one message, which the dispatcher's dedupe key would have to catch after the fact.
    expect(mentionsIn(`@[${ALICE}] @[${ALICE}] @[${ALICE}]`)).toEqual([ALICE]);
  });

  it('is not case-sensitive about the hex, because a uuid is not', () => {
    expect(mentionsIn(`@[${ALICE.toUpperCase()}]`)).toEqual([ALICE.toUpperCase()]);
  });

  it('ignores an email address, which is where an unescaped @ actually appears', () => {
    expect(mentionsIn('mail me at priya@example.com')).toEqual([]);
  });

  it('ignores a name typed by hand, which is the forgery this grammar exists to prevent', () => {
    expect(mentionsIn('@priya can you look at this?')).toEqual([]);
    expect(mentionsIn('@[priya]')).toEqual([]);
  });

  it('ignores anything that is not exactly thirty-six characters of uuid', () => {
    expect(mentionsIn(`@[${ALICE.slice(0, 35)}]`)).toEqual([]);
    expect(mentionsIn(`@[${ALICE}0]`)).toEqual([]);
    expect(mentionsIn(`@[${ALICE.replace('-', 'g')}]`)).toEqual([]);
  });

  it('ignores a mention with no brackets and one with no @', () => {
    expect(mentionsIn(`@${ALICE}`)).toEqual([]);
    expect(mentionsIn(`[${ALICE}]`)).toEqual([]);
  });
});

describe('maskMentions', () => {
  it('replaces every mention, leaving the rest of the line alone', () => {
    expect(maskMentions(`@[${ALICE}] and @[${BOB}] — standup at ten`)).toBe(
      '@someone and @someone — standup at ten',
    );
  });

  it('leaves a message with no mentions untouched', () => {
    expect(maskMentions('Pushed the fix')).toBe('Pushed the fix');
  });

  it('takes a label, for a caller that has a better word than "someone"', () => {
    expect(maskMentions(`@[${ALICE}]`, '@you')).toBe('@you');
  });
});

describe('splitMentions', () => {
  it('splits a line into its text and its mentions, in order', () => {
    expect(splitMentions(`hi @[${ALICE}]!`)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: ALICE },
      { kind: 'text', text: '!' },
    ]);
  });

  it('handles a line that is nothing but a mention', () => {
    expect(splitMentions(`@[${ALICE}]`)).toEqual([{ kind: 'mention', userId: ALICE }]);
  });

  it('returns one text part for a line with no mentions, and nothing for an empty one', () => {
    expect(splitMentions('Pushed the fix')).toEqual([{ kind: 'text', text: 'Pushed the fix' }]);
    expect(splitMentions('')).toEqual([]);
  });

  it('keeps two adjacent mentions apart', () => {
    expect(splitMentions(`@[${ALICE}]@[${BOB}]`)).toEqual([
      { kind: 'mention', userId: ALICE },
      { kind: 'mention', userId: BOB },
    ]);
  });

  it('loses nothing: the parts always rebuild the body', () => {
    const body = `ok @[${ALICE}], and @[${BOB}] too — see priya@example.com`;
    const rebuilt = splitMentions(body)
      .map((part) => (part.kind === 'text' ? part.text : `@[${part.userId}]`))
      .join('');
    expect(rebuilt).toBe(body);
  });
});
