import {
  distinctivePhrases,
  findLeakage,
  parseStructuredSummary,
  renderSummaryText,
} from './output-guard';

const valid = JSON.stringify({
  summary: 'Two tasks were completed.',
  highlights: ['Fixed the login redirect'],
  risks: [],
  references: ['TASK-1'],
});

describe('parseStructuredSummary — what it accepts', () => {
  it('parses the agreed shape', () => {
    const result = parseStructuredSummary(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('Two tasks were completed.');
    expect(result.value.highlights).toEqual(['Fixed the login redirect']);
  });

  it('tolerates a code fence around it', () => {
    expect(parseStructuredSummary('```json\n' + valid + '\n```').ok).toBe(true);
  });

  it('tolerates a sentence before the object', () => {
    expect(parseStructuredSummary(`Here is the summary:\n${valid}`).ok).toBe(true);
  });

  it('unwraps an object a model put in an array', () => {
    // The content is there and it is the agreed shape; the wrapper carries no meaning.
    const result = parseStructuredSummary(`[${valid}]`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('Two tasks were completed.');
  });

  it('finds the object even when a string in it contains braces', () => {
    const tricky = JSON.stringify({
      summary: 'Changed the {config} block',
      highlights: [],
      risks: [],
      references: [],
    });
    const result = parseStructuredSummary(tricky);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('Changed the {config} block');
  });

  it('treats a missing list as empty rather than failing', () => {
    const result = parseStructuredSummary('{"summary":"Done"}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.risks).toEqual([]);
  });

  it('drops blank entries from a list', () => {
    const result = parseStructuredSummary(
      '{"summary":"Done","highlights":["a","  ",""],"risks":[],"references":[]}',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.highlights).toEqual(['a']);
  });
});

describe('parseStructuredSummary — what it refuses', () => {
  it('refuses prose with no object', () => {
    expect(parseStructuredSummary('The team had a productive week.')).toMatchObject({ ok: false });
  });

  it('refuses malformed JSON', () => {
    expect(parseStructuredSummary('{"summary": "Done",}')).toMatchObject({ ok: false });
  });

  it('refuses a truncated object', () => {
    expect(parseStructuredSummary('{"summary": "Done", "highlights": [')).toMatchObject({
      ok: false,
    });
  });

  it('refuses an array of values with no object in it', () => {
    expect(parseStructuredSummary('[1, 2, 3]')).toMatchObject({ ok: false });
  });

  it('refuses a missing summary', () => {
    expect(parseStructuredSummary('{"highlights":[]}')).toMatchObject({ ok: false });
  });

  it('refuses a summary that is not a string', () => {
    expect(parseStructuredSummary('{"summary": 42}')).toMatchObject({ ok: false });
  });

  it('refuses a list holding something that is not a string', () => {
    expect(parseStructuredSummary('{"summary":"Done","highlights":[{"a":1}]}')).toMatchObject({
      ok: false,
    });
  });

  it('refuses a list that is not a list', () => {
    expect(parseStructuredSummary('{"summary":"Done","risks":"none"}')).toMatchObject({
      ok: false,
    });
  });

  it('refuses a summary longer than the column holds', () => {
    const huge = JSON.stringify({ summary: 'x'.repeat(9000) });
    expect(parseStructuredSummary(huge)).toMatchObject({ ok: false });
  });

  it('says why, so the reason can be stored on the run', () => {
    const result = parseStructuredSummary('not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/JSON/);
  });
});

describe('findLeakage — internal text', () => {
  const internal = ['Spent four hours untangling the legacy session store before giving up'];

  it('catches a verbatim internal sentence in client text', () => {
    const findings = findLeakage({
      text: 'This week we spent four hours untangling the legacy session store before giving up.',
      internalTexts: internal,
      otherClientNames: [],
    });
    expect(findings.some((finding) => finding.kind === 'internal-text')).toBe(true);
  });

  it('catches a copied fragment, not only a whole copied record', () => {
    const findings = findLeakage({
      text: 'Work continued; untangling the legacy session store before giving up took time.',
      internalTexts: internal,
      otherClientNames: [],
    });
    expect(findings.some((finding) => finding.kind === 'internal-text')).toBe(true);
  });

  it('ignores differences in case and spacing', () => {
    const findings = findLeakage({
      text: 'SPENT   FOUR HOURS\nUNTANGLING THE LEGACY SESSION STORE before giving up',
      internalTexts: internal,
      otherClientNames: [],
    });
    expect(findings).not.toHaveLength(0);
  });

  it('passes text that genuinely says something else', () => {
    const findings = findLeakage({
      text: 'Sign-in reliability was improved this week.',
      internalTexts: internal,
      otherClientNames: [],
    });
    expect(findings).toHaveLength(0);
  });

  it('does not fire on a short internal note that is a common phrase', () => {
    // A three-word note is not distinctive enough to match on; matching it would make every
    // summary fail. Short notes are below the threshold on purpose.
    const findings = findLeakage({
      text: 'Fixed the bug and shipped it.',
      internalTexts: ['fixed it'],
      otherClientNames: [],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('findLeakage — money', () => {
  it.each([
    'The change came to ₹45,000',
    'Estimated at Rs. 12000',
    'This cost USD 900',
    'A margin of $1,200 was retained',
    'Roughly 2.5 lakh of effort',
  ])('catches %j', (text) => {
    const findings = findLeakage({ text, internalTexts: [], otherClientNames: [] });
    expect(findings.some((finding) => finding.kind === 'money')).toBe(true);
  });

  it('does not fire on an ordinary number', () => {
    const findings = findLeakage({
      text: 'We closed 14 tickets and deployed 3 releases.',
      internalTexts: [],
      otherClientNames: [],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('findLeakage — other clients', () => {
  it('catches another client named in the text', () => {
    const findings = findLeakage({
      text: 'The same fix was applied for Zenith Retail.',
      internalTexts: [],
      otherClientNames: ['Zenith Retail'],
    });
    expect(findings.some((finding) => finding.kind === 'other-client')).toBe(true);
  });

  it('ignores a name too short to be one', () => {
    const findings = findLeakage({
      text: 'It was an AB test',
      internalTexts: [],
      otherClientNames: ['AB'],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('distinctivePhrases', () => {
  it('produces overlapping windows', () => {
    const phrases = distinctivePhrases('one two three four five six seven eight');
    expect(phrases[0]).toBe('one two three four five six');
    expect(phrases[1]).toBe('two three four five six seven');
  });

  it('produces nothing for a note too short to be distinctive', () => {
    expect(distinctivePhrases('done')).toEqual([]);
  });
});

describe('renderSummaryText', () => {
  it('lays the sections out in a fixed order', () => {
    const text = renderSummaryText({
      summary: 'Two tasks completed.',
      highlights: ['Login fixed'],
      risks: ['Deploy is blocked'],
      references: ['TASK-1'],
    });
    expect(text).toBe(
      'Two tasks completed.\n\nHighlights:\n- Login fixed\n\nRisks and blockers:\n- Deploy is blocked\n\nReferences: TASK-1',
    );
  });

  it('omits an empty section rather than printing an empty heading', () => {
    const text = renderSummaryText({
      summary: 'Nothing much.',
      highlights: [],
      risks: [],
      references: [],
    });
    expect(text).toBe('Nothing much.');
  });
});
