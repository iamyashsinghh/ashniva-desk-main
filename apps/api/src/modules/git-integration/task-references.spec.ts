import { groupReferences, parseTaskReferences } from './task-references';

describe('parseTaskReferences', () => {
  it('finds the generic form a developer types', () => {
    expect(parseTaskReferences('TSK-123 fix the checkout total')).toEqual([
      { prefix: 'TSK', number: 123, generic: true, raw: 'TSK-123' },
    ]);
  });

  it('finds the project-code form the app itself shows', () => {
    const [reference] = parseTaskReferences('ACM-14 loyalty email template');
    expect(reference).toMatchObject({ prefix: 'ACM', number: 14, generic: false });
  });

  it('finds references inside a branch name', () => {
    // Branch separators are / and -, so a plain word boundary on both sides is not enough.
    expect(parseTaskReferences('feature/ACM-14-checkout-fix').map((r) => r.raw)).toEqual([
      'ACM-14',
    ]);
    expect(parseTaskReferences('bugfix/TSK-7').map((r) => r.raw)).toEqual(['TSK-7']);
  });

  it('does not match a longer number or a longer prefix', () => {
    // ACM-14 must not be found inside ACM-142, or a fix would attach to the wrong task.
    expect(parseTaskReferences('ACM-142').map((r) => r.number)).toEqual([142]);
    expect(parseTaskReferences('XACM-14').map((r) => r.prefix)).toEqual(['XACM']);
  });

  it('collects several references across several texts, first occurrence wins', () => {
    const references = parseTaskReferences(
      'TSK-1 and ACM-2',
      'feature/TSK-1-again',
      'closes TSK-3',
    );
    expect(references.map((r) => r.raw)).toEqual(['TSK-1', 'ACM-2', 'TSK-3']);
  });

  it('uppercases the prefix so case in a branch name does not matter', () => {
    expect(parseTaskReferences('feature/tsk-9').map((r) => r.prefix)).toEqual(['TSK']);
    expect(parseTaskReferences('feature/tsk-9')[0]?.generic).toBe(true);
  });

  it('ignores empty input', () => {
    expect(parseTaskReferences(null, undefined, '')).toEqual([]);
  });

  it('collects anything reference-shaped and leaves resolution to fail harmlessly', () => {
    // "UTF-8" looks exactly like a reference. Guessing which prefixes are "real" here would be
    // worse than collecting it and finding no matching task.
    expect(parseTaskReferences('encode as UTF-8').map((r) => r.raw)).toEqual(['UTF-8']);
  });

  it('rejects a number that is not a positive integer', () => {
    expect(parseTaskReferences('ACM-0')).toEqual([]);
  });
});

describe('groupReferences', () => {
  it('separates generic numbers from project-keyed references', () => {
    const grouped = groupReferences(parseTaskReferences('TSK-1 ACM-2 TSK-3'));
    expect(grouped.numbers).toEqual([1, 3]);
    expect(grouped.keyed).toEqual([{ code: 'ACM', number: 2 }]);
  });

  it('returns empty lists for no references', () => {
    expect(groupReferences([])).toEqual({ numbers: [], keyed: [] });
  });
});
