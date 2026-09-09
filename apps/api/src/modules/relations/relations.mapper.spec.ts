import { WORK_RELATION_ROLE, WORK_RELATION_TYPE } from '@ashniva/types';

import { otherTaskId, otherTicketId, toTicketRelationView } from './relations.mapper';
import type { RelatedTicketRow, TaskRelationRow, TicketRelationRow } from './relations.repository';

const LINKED_AT = new Date('2026-09-01T10:00:00.000Z');

function relation(over: Partial<TicketRelationRow> = {}): TicketRelationRow {
  return {
    id: 'rel-1',
    type: WORK_RELATION_TYPE.DUPLICATE_OF,
    sourceTicketId: 'a',
    targetTicketId: 'b',
    note: 'same printer fault',
    closedDuplicate: true,
    linkedAt: LINKED_AT,
    linkedBy: { id: 'u1', name: 'Sara', email: 'sara@example.com' },
    ...over,
  };
}

function ticket(id: string, number: number): RelatedTicketRow {
  return {
    id,
    number,
    title: 'Invoice printing fails',
    status: 'NEW',
    priority: 'HIGH',
    clientOrganizationId: 'acme',
    clientOrganization: { id: 'acme', name: 'Acme Retail', slug: 'acme-retail' },
    assignedTo: null,
  };
}

describe('relations mapper', () => {
  it('reads the far end from whichever side asked', () => {
    expect(otherTicketId(relation(), 'a')).toBe('b');
    expect(otherTicketId(relation(), 'b')).toBe('a');
  });

  it('reads the far end of a task link the same way', () => {
    const row = { sourceTaskId: 'x', targetTaskId: 'y' } as TaskRelationRow;
    expect(otherTaskId(row, 'x')).toBe('y');
    expect(otherTaskId(row, 'y')).toBe('x');
  });

  it('says "duplicate of" on the copy and "duplicated by" on the one kept', () => {
    const readable = new Map([['b', ticket('b', 45)]]);
    const fromCopy = toTicketRelationView(relation(), 'a', readable);
    expect(fromCopy.role).toBe(WORK_RELATION_ROLE.DUPLICATE);
    expect(fromCopy.other?.key).toBe('T-45');

    const fromKept = toTicketRelationView(relation(), 'b', new Map([['a', ticket('a', 12)]]));
    expect(fromKept.role).toBe(WORK_RELATION_ROLE.CANONICAL);
    expect(fromKept.other?.key).toBe('T-12');
  });

  it('says "related" from both ends of a symmetric link', () => {
    const row = relation({ type: WORK_RELATION_TYPE.RELATED_TO });
    expect(toTicketRelationView(row, 'a', new Map()).role).toBe(WORK_RELATION_ROLE.RELATED);
    expect(toTicketRelationView(row, 'b', new Map()).role).toBe(WORK_RELATION_ROLE.RELATED);
  });

  /**
   * The point of the whole exercise: a far end the caller may not read leaves *nothing* behind —
   * no id, no key, no title, no client name. A link is a disclosure, and a redacted row must not
   * be a way of asking whether a particular ticket exists.
   */
  it('leaves no id and no title when the far end is not readable', () => {
    const view = toTicketRelationView(relation(), 'a', new Map());
    expect(view.other).toBeNull();
    expect(JSON.stringify(view)).not.toContain('T-45');
    expect(JSON.stringify(view)).not.toContain('"b"');
  });

  it('carries the note and who linked it, which are internal facts about the link itself', () => {
    const view = toTicketRelationView(relation(), 'a', new Map());
    expect(view.note).toBe('same printer fault');
    expect(view.linkedBy?.name).toBe('Sara');
    expect(view.linkedAt).toBe(LINKED_AT.toISOString());
  });
});
