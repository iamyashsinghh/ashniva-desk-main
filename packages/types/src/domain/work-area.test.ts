import {
  MAX_WORK_AREAS,
  WORK_AREA_MAX_LENGTH,
  coversWorkArea,
  normalizeWorkArea,
  normalizeWorkAreas,
} from './work-area';

/**
 * Responsibilities are free text, which is the whole point — and also the risk.
 *
 * The support router matches a ticket's area against what people are responsible for, so two tags
 * that a human reads as the same word have to compare equal. Everything here is about that.
 */

describe('normalizeWorkArea', () => {
  it('matches a suggestion whatever case it was typed in', () => {
    for (const typed of ['frontend', 'FRONTEND', 'FrontEnd', '  Frontend  ']) {
      expect({ typed, area: normalizeWorkArea(typed) }).toEqual({ typed, area: 'Frontend' });
    }
  });

  it('keeps a word of its own exactly as the manager wrote it', () => {
    // Their vocabulary, not ours: the list is a suggestion, not a permitted set.
    expect(normalizeWorkArea('Data engineering')).toBe('Data engineering');
    expect(normalizeWorkArea('  Billing   integrations ')).toBe('Billing integrations');
  });
});

describe('normalizeWorkAreas', () => {
  it('de-duplicates case-insensitively, so one responsibility is not stored twice', () => {
    expect(normalizeWorkAreas(['API', 'api', ' Api '])).toEqual(['API']);
  });

  it('keeps the order the manager chose', () => {
    expect(normalizeWorkAreas(['Backend', 'Frontend'])).toEqual(['Backend', 'Frontend']);
  });

  it('drops empties rather than storing a blank tag', () => {
    expect(normalizeWorkAreas(['Backend', '', '   ', 'API'])).toEqual(['Backend', 'API']);
  });

  it('drops anything longer than a tag, so prose cannot be smuggled in', () => {
    expect(normalizeWorkAreas(['x'.repeat(WORK_AREA_MAX_LENGTH + 1), 'API'])).toEqual(['API']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_WORK_AREAS + 5 }, (_, index) => `Area ${index}`);
    expect(normalizeWorkAreas(many)).toHaveLength(MAX_WORK_AREAS);
  });
});

describe('coversWorkArea', () => {
  it('matches however either side was capitalised', () => {
    expect(coversWorkArea(['Frontend', 'API'], 'api')).toBe(true);
    expect(coversWorkArea(['frontend'], 'Frontend')).toBe(true);
  });

  it('does not match a responsibility nobody holds', () => {
    expect(coversWorkArea(['Frontend'], 'DevOps')).toBe(false);
  });

  it('does not match on a substring', () => {
    // "API" must not be satisfied by "Rapid prototyping" — the router would pick the wrong person.
    expect(coversWorkArea(['Rapid prototyping'], 'API')).toBe(false);
  });

  it('is false for somebody with no responsibilities recorded', () => {
    expect(coversWorkArea([], 'Backend')).toBe(false);
  });
});
