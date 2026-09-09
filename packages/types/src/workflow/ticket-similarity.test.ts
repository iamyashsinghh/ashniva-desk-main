import {
  MAX_KEYWORDS,
  MAX_KEYWORD_SCORE,
  SIMILARITY_MIN_SCORE,
  extractErrorCode,
  extractKeywords,
  rankSimilar,
  similarityScore,
  ticketFingerprint,
  type SimilarityCandidate,
} from './ticket-similarity';

/**
 * The matcher decides which tickets a support executive is shown as "probably the same fault", so
 * the two properties worth pinning down are the ones that make the panel worth reading: a word
 * everybody uses must never make two tickets look alike, and a quoted error code must be enough on
 * its own.
 */

function candidate(over: Partial<SimilarityCandidate> = {}): SimilarityCandidate {
  return {
    ticketId: 'a',
    productId: null,
    module: null,
    productVersion: null,
    type: 'SUPPORT',
    keywords: [],
    errorCode: null,
    ...over,
  };
}

describe('extractKeywords', () => {
  it('drops the words that appear in half of all tickets', () => {
    // "fails" and "after" are stop words; "the" and "an" are under four characters.
    expect(extractKeywords('Login fails after an update')).toEqual(['login', 'update']);
  });

  it('lower-cases, splits on punctuation and de-duplicates', () => {
    expect(extractKeywords('Scanner/SCANNER — scanner, timeout!')).toEqual(['scanner', 'timeout']);
  });

  it('reads several texts as one ticket', () => {
    expect(extractKeywords('Invoice screen', null, 'invoice printing')).toEqual([
      'invoice',
      'screen',
      'printing',
    ]);
  });

  it('caps a pasted stack trace so one ticket cannot match everything', () => {
    const words = Array.from({ length: MAX_KEYWORDS + 20 }, (_, index) => `word${index}`).join(' ');
    expect(extractKeywords(words)).toHaveLength(MAX_KEYWORDS);
  });
});

describe('extractErrorCode', () => {
  it.each([
    ['Crashes with ERR_SCAN_TIMEOUT every morning', 'ERR_SCAN_TIMEOUT'],
    ['Reported as SQL0904 on the nightly job', 'SQL0904'],
    ['Windows says 0x80070005', '0X80070005'],
  ])('reads a quoted code out of %p', (text, expected) => {
    expect(extractErrorCode(text)).toBe(expected);
  });

  it('takes only the first, so editing the tail of a log does not move it', () => {
    expect(extractErrorCode('ERR_ONE then ERR_TWO then ERR_THREE')).toBe('ERR_ONE');
  });

  it('finds nothing in ordinary prose', () => {
    expect(extractErrorCode('The invoice screen is slow in the mornings')).toBeNull();
  });
});

describe('ticketFingerprint', () => {
  it('joins the four coarse facts, lower-cased, with a placeholder for the missing ones', () => {
    expect(
      ticketFingerprint({
        productId: 'P1',
        module: ' Billing ',
        productVersion: null,
        errorCode: 'ERR_X',
      }),
    ).toBe('p1|billing|-|err_x');
  });
});

describe('similarityScore', () => {
  it('gives a shared stop word nothing, because it was never a keyword', () => {
    // Both tickets say "fails after"; neither keeps a keyword from it, so nothing but the type
    // remains — and half a point is below the threshold on purpose.
    const a = candidate({ ticketId: 'a', keywords: extractKeywords('Fails after') });
    const b = candidate({ ticketId: 'b', keywords: extractKeywords('Fails after') });
    const result = similarityScore(a, b);
    expect(result.score).toBe(0.5);
    expect(result.signals.map((signal) => signal.key)).toEqual(['type']);
  });

  it('lets a shared error code clear the threshold on its own', () => {
    // Different types, no module, no version, not one word in common: the code is the whole score.
    const a = candidate({ ticketId: 'a', type: 'SUPPORT', errorCode: 'ERR_SCAN_TIMEOUT' });
    const b = candidate({ ticketId: 'b', type: 'BUG', errorCode: 'ERR_SCAN_TIMEOUT' });
    const result = similarityScore(a, b);
    expect(result.score).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(SIMILARITY_MIN_SCORE);
    expect(result.signals).toEqual([{ key: 'error-code', detail: 'error code ERR_SCAN_TIMEOUT' }]);
  });

  it('adds module, version and each shared keyword', () => {
    const a = candidate({
      ticketId: 'a',
      module: 'Billing',
      productVersion: '3.1.4',
      keywords: ['invoice', 'printing', 'slow'],
    });
    const b = candidate({
      ticketId: 'b',
      module: 'billing',
      productVersion: '3.1.4',
      keywords: ['invoice', 'printing'],
    });
    // module 2 + version 1 + two keywords + same type 0.5
    expect(similarityScore(a, b).score).toBe(5.5);
  });

  it('records the shared product without scoring it', () => {
    const a = candidate({ ticketId: 'a', productId: 'p1' });
    const b = candidate({ ticketId: 'b', productId: 'p1' });
    const result = similarityScore(a, b);
    expect(result.score).toBe(0.5);
    expect(result.signals.map((signal) => signal.key)).toContain('product');
  });

  it('caps what shared words are worth, so a quoted error code still wins', () => {
    // The case the cap exists for: two people paste the same log boilerplate and share every word
    // they have, while two others quote the same code and nothing else. The second pair is the
    // real match, and before the cap the first pair outranked them by an order of magnitude.
    const trace = Array.from({ length: MAX_KEYWORDS }, (_, index) => `frame${index}`);
    const pasted = similarityScore(
      candidate({ ticketId: 'a', keywords: trace }),
      candidate({ ticketId: 'b', keywords: trace }),
    );
    const quoted = similarityScore(
      candidate({ ticketId: 'c', type: 'SUPPORT', errorCode: 'ERR_SCAN_TIMEOUT' }),
      candidate({ ticketId: 'd', type: 'BUG', errorCode: 'ERR_SCAN_TIMEOUT' }),
    );
    expect(pasted.score).toBe(MAX_KEYWORD_SCORE + 0.5);
    expect(quoted.score).toBeGreaterThan(pasted.score);
  });

  it('does not match two tickets that merely both left the module blank', () => {
    const a = candidate({ ticketId: 'a', module: null, productVersion: null });
    const b = candidate({ ticketId: 'b', module: null, productVersion: null });
    expect(similarityScore(a, b).score).toBe(0.5);
  });
});

describe('rankSimilar', () => {
  const subject = candidate({
    ticketId: 'subject',
    module: 'Billing',
    keywords: ['invoice', 'printing'],
  });

  it('keeps only candidates at or above the threshold, best first', () => {
    const strong = candidate({ ticketId: 'strong', module: 'Billing', keywords: ['invoice'] });
    const weak = candidate({ ticketId: 'weak', keywords: ['invoice'] });
    const ranked = rankSimilar(subject, [weak, strong]);
    expect(ranked.map((entry) => entry.candidate.ticketId)).toEqual(['strong']);
    expect(ranked[0]?.score).toBe(3.5);
  });

  it('never suggests the ticket itself', () => {
    expect(rankSimilar(subject, [subject])).toEqual([]);
  });

  it('breaks a tie by id so the list does not shuffle between page loads', () => {
    const first = candidate({ ticketId: 'aaa', module: 'Billing', keywords: ['invoice'] });
    const second = candidate({ ticketId: 'bbb', module: 'Billing', keywords: ['invoice'] });
    expect(rankSimilar(subject, [second, first]).map((entry) => entry.candidate.ticketId)).toEqual([
      'aaa',
      'bbb',
    ]);
  });

  it('honours the caller’s limit', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) =>
      candidate({ ticketId: id, module: 'Billing', keywords: ['invoice'] }),
    );
    expect(rankSimilar(subject, many, { limit: 2 })).toHaveLength(2);
  });
});
