import {
  WORK_RELATION_ROLE,
  WORK_RELATION_TYPE,
  isSymmetricRelation,
  relationRole,
} from '../domain/work-relation';
import {
  duplicateCloseNote,
  joins,
  orderRelationPair,
  planRelation,
  type RelationEdge,
} from './work-relations';

const D = WORK_RELATION_TYPE.DUPLICATE_OF;
const R = WORK_RELATION_TYPE.RELATED_TO;

const duplicate = (sourceId: string, targetId: string): RelationEdge => ({
  type: D,
  sourceId,
  targetId,
});
const related = (sourceId: string, targetId: string): RelationEdge => ({
  type: R,
  sourceId,
  targetId,
});

describe('work relation types', () => {
  it('makes only RELATED_TO symmetric', () => {
    expect(isSymmetricRelation(R)).toBe(true);
    expect(isSymmetricRelation(D)).toBe(false);
  });

  it('reads a duplicate row from both ends', () => {
    const row = { type: D, sourceId: 'a', targetId: 'b' };
    expect(relationRole(row, 'a')).toBe(WORK_RELATION_ROLE.DUPLICATE);
    expect(relationRole(row, 'b')).toBe(WORK_RELATION_ROLE.CANONICAL);
  });

  it('reads a symmetric row as related from either end', () => {
    const row = { type: R, sourceId: 'a', targetId: 'b' };
    expect(relationRole(row, 'a')).toBe(WORK_RELATION_ROLE.RELATED);
    expect(relationRole(row, 'b')).toBe(WORK_RELATION_ROLE.RELATED);
  });
});

describe('orderRelationPair', () => {
  it('keeps the direction of a duplicate', () => {
    expect(orderRelationPair({ type: D, fromId: 'z', toId: 'a' })).toEqual({
      type: D,
      sourceId: 'z',
      targetId: 'a',
    });
  });

  it('orders a symmetric pair by id, whichever end asked', () => {
    const one = orderRelationPair({ type: R, fromId: 'z', toId: 'a' });
    const other = orderRelationPair({ type: R, fromId: 'a', toId: 'z' });
    expect(one).toEqual({ type: R, sourceId: 'a', targetId: 'z' });
    expect(other).toEqual(one);
  });
});

describe('joins', () => {
  it('matches a pair whichever way round it was stored', () => {
    expect(joins(duplicate('a', 'b'), 'a', 'b')).toBe(true);
    expect(joins(duplicate('a', 'b'), 'b', 'a')).toBe(true);
    expect(joins(duplicate('a', 'b'), 'a', 'c')).toBe(false);
  });
});

describe('planRelation', () => {
  it('allows a first duplicate and keeps its direction', () => {
    expect(planRelation({ type: D, fromId: 'a', toId: 'b' }, [])).toEqual({
      allowed: true,
      stored: { type: D, sourceId: 'a', targetId: 'b' },
    });
  });

  it('refuses a self link', () => {
    const decision = planRelation({ type: D, fromId: 'a', toId: 'a' }, []);
    expect(decision).toEqual({ allowed: false, reason: 'An item cannot be linked to itself' });
  });

  it('refuses a self link for a symmetric relation too', () => {
    expect(planRelation({ type: R, fromId: 'a', toId: 'a' }, []).allowed).toBe(false);
  });

  it('refuses a second row for a pair that is already linked, in either direction', () => {
    expect(planRelation({ type: R, fromId: 'a', toId: 'b' }, [duplicate('a', 'b')])).toEqual({
      allowed: false,
      reason: 'These two are already linked',
    });
    expect(planRelation({ type: D, fromId: 'b', toId: 'a' }, [related('a', 'b')]).allowed).toBe(
      false,
    );
  });

  it('refuses a second canonical for the same duplicate', () => {
    const decision = planRelation({ type: D, fromId: 'a', toId: 'c' }, [duplicate('a', 'b')]);
    expect(decision).toEqual({
      allowed: false,
      reason: 'This is already marked a duplicate of something else',
    });
  });

  it('refuses pointing at an item that is itself a duplicate', () => {
    const decision = planRelation({ type: D, fromId: 'a', toId: 'b' }, [duplicate('b', 'c')]);
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({
      reason: 'The item you picked is itself a duplicate — link to the one it points at instead',
    });
  });

  it('refuses turning an item that already has duplicates into a duplicate', () => {
    const decision = planRelation({ type: D, fromId: 'a', toId: 'b' }, [duplicate('c', 'a')]);
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({
      reason:
        'Something is already marked a duplicate of this one, so it cannot become a duplicate itself',
    });
  });

  it('refuses the two-step cycle A→B, B→A', () => {
    expect(planRelation({ type: D, fromId: 'b', toId: 'a' }, [duplicate('a', 'b')]).allowed).toBe(
      false,
    );
  });

  it('refuses the three-step cycle A→B, B→C, C→A', () => {
    // The chain cannot even be built: B→C is refused because B is already a duplicate.
    const chain = planRelation({ type: D, fromId: 'b', toId: 'c' }, [duplicate('a', 'b')]);
    expect(chain.allowed).toBe(false);
    // And with the chain assumed to exist anyway, closing it is still refused.
    const close = planRelation({ type: D, fromId: 'c', toId: 'a' }, [
      duplicate('a', 'b'),
      duplicate('b', 'c'),
    ]);
    expect(close.allowed).toBe(false);
  });

  it('allows several duplicates of the same kept item', () => {
    expect(planRelation({ type: D, fromId: 'c', toId: 'b' }, [duplicate('a', 'b')]).allowed).toBe(
      true,
    );
  });

  it('allows a related link between items that already carry duplicates', () => {
    expect(planRelation({ type: R, fromId: 'a', toId: 'c' }, [duplicate('a', 'b')]).allowed).toBe(
      true,
    );
  });
});

describe('duplicateCloseNote', () => {
  it('names the kept ticket when both belong to the same client', () => {
    expect(duplicateCloseNote({ canonicalKey: 'T-45', sameClient: true })).toContain('T-45');
  });

  it('never names it across clients', () => {
    const note = duplicateCloseNote({ canonicalKey: 'T-45', sameClient: false });
    expect(note).not.toContain('T-45');
    expect(note).toBe('Duplicate of an existing ticket, which is where this is being tracked');
  });
});
