import { dayHeading, groupMessagesByDay, type GroupableMessage } from './message-grouping';

/**
 * Day separators and sender runs.
 *
 * The interesting cases are all boundaries: the same person either side of midnight, the same
 * person either side of the gap, and a system note in the middle of somebody's run.
 */

function message(over: Partial<GroupableMessage> & { id: string }): GroupableMessage {
  return {
    createdAt: '2026-09-13T09:00:00.000Z',
    systemKind: null,
    sender: { id: 'priya' },
    ...over,
  };
}

/** A local time, so the assertions do not depend on the timezone the tests happen to run in. */
function at(local: string): string {
  return new Date(local).toISOString();
}

describe('groupMessagesByDay', () => {
  it('puts a whole conversation in one section when it happened in one day', () => {
    const sections = groupMessagesByDay([
      message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', createdAt: at('2026-09-13T09:01:00') }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.runs).toHaveLength(1);
    expect(sections[0]?.runs[0]?.messages.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('starts a new section at the reader’s midnight rather than at UTC’s', () => {
    // 23:59 and 00:01 local are the same UTC day in some timezones and not in others. The day a
    // message belongs to is the one the person who wrote it would name.
    const sections = groupMessagesByDay([
      message({ id: 'late', createdAt: at('2026-09-13T23:59:00') }),
      message({ id: 'early', createdAt: at('2026-09-14T00:01:00') }),
    ]);

    expect(sections.map((section) => section.day)).toEqual(['2026-09-13', '2026-09-14']);
  });

  it('breaks a run when the same person comes back much later', () => {
    const sections = groupMessagesByDay([
      message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', createdAt: at('2026-09-13T09:30:00') }),
    ]);

    expect(sections[0]?.runs).toHaveLength(2);
  });

  it('breaks a run when somebody else speaks', () => {
    const sections = groupMessagesByDay([
      message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', createdAt: at('2026-09-13T09:01:00'), sender: { id: 'dev' } }),
      message({ id: 'c', createdAt: at('2026-09-13T09:02:00') }),
    ]);

    expect(sections[0]?.runs.map((run) => run.senderId)).toEqual(['priya', 'dev', 'priya']);
  });

  it('never folds a system note into somebody’s run, in either direction', () => {
    // Otherwise "a call was started" loses its own line and reads as something Priya said.
    const sections = groupMessagesByDay([
      message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
      message({
        id: 'call',
        createdAt: at('2026-09-13T09:01:00'),
        sender: null,
        systemKind: 'CALL_STARTED',
      }),
      message({ id: 'b', createdAt: at('2026-09-13T09:02:00') }),
    ]);

    const runs = sections[0]?.runs ?? [];
    expect(runs).toHaveLength(3);
    expect(runs[1]?.isSystem).toBe(true);
    expect(runs[0]?.isSystem).toBe(false);
  });

  it('keys each run by its first message, so a re-render does not reshuffle the thread', () => {
    const sections = groupMessagesByDay([
      message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', createdAt: at('2026-09-13T09:01:00') }),
    ]);

    expect(sections[0]?.runs[0]?.key).toBe('a');
  });

  it('returns nothing for an empty thread rather than an empty section', () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });
});

describe('dayHeading', () => {
  const now = new Date('2026-09-14T12:00:00');

  it('names today and yesterday', () => {
    expect(dayHeading('2026-09-14', now)).toBe('Today');
    expect(dayHeading('2026-09-13', now)).toBe('Yesterday');
  });

  it('leaves anything older to the caller’s date formatter', () => {
    expect(dayHeading('2026-09-01', now)).toBeNull();
  });
});
