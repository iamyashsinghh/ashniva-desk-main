import { MIN_MENTIONABLE_QUERY_LENGTH } from '@ashniva/types';

import {
  activeMention,
  bodyToDraft,
  draftToBody,
  insertMention,
  mentionSearchTerm,
} from './mention-draft';

/**
 * The `@` somebody is typing.
 *
 * The picker's whole correctness rests on this: what opens it, what it searches for, what it
 * writes into the field and what is sent. The last one matters most — the field shows a name, but
 * the body carries the user's id, because a body with names in it is one the notification path
 * cannot read and one where a mention could be forged by typing a name.
 */

const PRIYA = '11111111-1111-4111-8111-111111111111';

describe('activeMention', () => {
  it('opens on an @ at the start of a word', () => {
    expect(activeMention('@pri', 4)).toEqual({ term: 'pri', start: 0, end: 4 });
    expect(activeMention('ready @pri', 10)).toEqual({ term: 'pri', start: 6, end: 10 });
  });

  it('opens the moment @ is pressed, before anything is typed', () => {
    expect(activeMention('@', 1)).toEqual({ term: '', start: 0, end: 1 });
  });

  it('is not opened by an email address', () => {
    expect(activeMention('write to sam@example', 20)).toBeNull();
  });

  it('closes once the word ends', () => {
    expect(activeMention('@priya is here', 14)).toBeNull();
  });

  it('does not re-parse a mention that has already been inserted', () => {
    expect(activeMention(`@[${PRIYA}]`, 39)).toBeNull();
  });

  it('ignores the text after the caret', () => {
    expect(activeMention('@pri and more', 4)).toEqual({ term: 'pri', start: 0, end: 4 });
  });
});

describe('mentionSearchTerm', () => {
  it('sends nothing until the term is worth searching for', () => {
    expect(mentionSearchTerm({ term: '', start: 0, end: 1 })).toBeNull();
    expect(mentionSearchTerm({ term: 'p', start: 0, end: 2 })).toBeNull();
  });

  it('sends the term once it reaches the shared minimum', () => {
    const term = 'p'.repeat(MIN_MENTIONABLE_QUERY_LENGTH);
    expect(mentionSearchTerm({ term, start: 0, end: term.length + 1 })).toBe(term);
  });

  it('sends nothing when there is no mention being typed', () => {
    expect(mentionSearchTerm(null)).toBeNull();
  });
});

describe('insertMention', () => {
  it('writes the name into the field and leaves the caret after it', () => {
    const result = insertMention('ready @pri', { term: 'pri', start: 6, end: 10 }, 'Priya S');
    expect(result.text).toBe('ready @Priya S ');
    expect(result.caret).toBe(result.text.length);
  });

  it('keeps whatever was typed after the caret', () => {
    const result = insertMention('@pri please', { term: 'pri', start: 0, end: 4 }, 'Priya S');
    expect(result.text).toBe('@Priya S  please');
  });

  it('does not reopen the picker once the name is in', () => {
    const result = insertMention('ready @pri', { term: 'pri', start: 6, end: 10 }, 'Priya S');
    expect(activeMention(result.text, result.caret)).toBeNull();
  });
});

describe('draftToBody and bodyToDraft', () => {
  const picked = new Map([[PRIYA, 'Priya S']]);

  it('sends the picked name as its id', () => {
    expect(draftToBody('ready @Priya S for review', picked)).toBe(`ready @[${PRIYA}] for review`);
  });

  it('sends a name nobody picked as plain text', () => {
    expect(draftToBody('ready @Priya S for review', new Map())).toBe('ready @Priya S for review');
  });

  it('opens a stored body with names, and saves it back with the same ids', () => {
    const opened = bodyToDraft(`ready @[${PRIYA}]?`, picked);
    expect(opened.draft).toBe('ready @Priya S?');
    expect(draftToBody(opened.draft, opened.names)).toBe(`ready @[${PRIYA}]?`);
  });
});

// What a refused mention does to the body moved to `mention-refusal.test.ts` along with the
// function itself: the token is now rewritten as a name rather than deleted, which is what the web
// app does, and the whole of that refusal — recognising it and recovering from it — belongs in one
// file rather than half here.
