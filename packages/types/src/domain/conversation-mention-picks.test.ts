import { decodeMentions, encodeMentions, mentionsIn } from './conversation';

const PRIYA = '01a0a8fe-4c51-7609-8221-8095f37627e9';
const SAM = '0190c1d2-0000-7000-8000-000000000002';

/**
 * The field shows names; the body carries ids. These tests pin the translation both ways, and the
 * negative cases matter most: a name that was not picked must never turn into a mention.
 */
describe('encodeMentions', () => {
  it('writes each picked name as its id', () => {
    const body = encodeMentions('hi @Priya Sharma, can you check?', [
      { userId: PRIYA, name: 'Priya Sharma' },
    ]);
    expect(body).toBe(`hi @[${PRIYA}], can you check?`);
    expect(mentionsIn(body)).toEqual([PRIYA]);
  });

  it('leaves a name typed by hand as text', () => {
    expect(encodeMentions('hi @Priya Sharma', [])).toBe('hi @Priya Sharma');
    expect(encodeMentions('hi @Sam', [{ userId: PRIYA, name: 'Priya Sharma' }])).toBe('hi @Sam');
  });

  it('prefers the longer name when one picked name starts another', () => {
    const body = encodeMentions('@Sam and @Sam Lee', [
      { userId: PRIYA, name: 'Sam' },
      { userId: SAM, name: 'Sam Lee' },
    ]);
    expect(body).toBe(`@[${PRIYA}] and @[${SAM}]`);
  });

  it('does not claim the start of a longer word', () => {
    expect(encodeMentions('@Samantha', [{ userId: SAM, name: 'Sam' }])).toBe('@Samantha');
  });

  it('treats characters in a name literally', () => {
    const picks = [{ userId: SAM, name: 'S. (QA)' }];
    expect(encodeMentions('@S. (QA) ok', picks)).toBe(`@[${SAM}] ok`);
    expect(encodeMentions('@Sx (QA) ok', picks)).toBe('@Sx (QA) ok');
  });

  it('writes every occurrence of a picked name', () => {
    expect(encodeMentions('@Sam, @Sam', [{ userId: SAM, name: 'Sam' }])).toBe(
      `@[${SAM}], @[${SAM}]`,
    );
  });
});

describe('decodeMentions', () => {
  it('shows names and returns the picks that saving writes back', () => {
    const names = new Map([[PRIYA, 'Priya Sharma']]);
    const decoded = decodeMentions(`hi @[${PRIYA}] ok`, names);
    expect(decoded.text).toBe('hi @Priya Sharma ok');
    expect(decoded.picks).toEqual([{ userId: PRIYA, name: 'Priya Sharma' }]);
    expect(encodeMentions(decoded.text, decoded.picks)).toBe(`hi @[${PRIYA}] ok`);
  });

  it('keeps the token of somebody it has no name for', () => {
    const decoded = decodeMentions(`hi @[${SAM}]`, new Map());
    expect(decoded.text).toBe(`hi @[${SAM}]`);
    expect(decoded.picks).toEqual([]);
  });
});
