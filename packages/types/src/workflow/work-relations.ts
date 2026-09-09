import {
  WORK_RELATION_TYPE,
  isSymmetricRelation,
  type WorkRelationType,
} from '../domain/work-relation';

/**
 * The rules a link between two work items has to satisfy, as arithmetic on the edges that already
 * exist.
 *
 * Kept here rather than in the API for the usual reason: the same decision is made for tickets and
 * for tasks, and two copies of "may these be linked" would eventually disagree about what a cycle
 * is. The API loads the edges touching the two items and asks this function; the answer carries the
 * sentence shown to the person as well as the row to write.
 */

export interface RelationEdge {
  type: WorkRelationType;
  sourceId: string;
  targetId: string;
}

export interface RelationRequest {
  type: WorkRelationType;
  /** The item the request was made from. For a duplicate, the copy. */
  fromId: string;
  /** The item being linked to. For a duplicate, the one being kept. */
  toId: string;
}

/** The row to write, once a request is allowed. */
export interface StoredRelation {
  type: WorkRelationType;
  sourceId: string;
  targetId: string;
}

export type RelationDecision =
  { allowed: true; stored: StoredRelation } | { allowed: false; reason: string };

/**
 * How many relations one item may carry.
 *
 * A cap rather than a page: the panel is a list somebody reads, and an item with hundreds of
 * "related" links has stopped meaning anything. It also bounds the visibility filter, which reads
 * every linked row before deciding what the caller may see.
 */
export const MAX_RELATIONS_PER_ITEM = 50;

/**
 * The stored form of a request.
 *
 * `DUPLICATE_OF` keeps the direction it was asked in — that direction is the statement. A
 * symmetric relation is ordered by id so that "link A to B" and "link B to A" are the same row and
 * the unique index on the pair is enough to stop the second one.
 */
export function orderRelationPair(request: RelationRequest): StoredRelation {
  if (!isSymmetricRelation(request.type)) {
    return { type: request.type, sourceId: request.fromId, targetId: request.toId };
  }
  const [sourceId, targetId] =
    request.fromId < request.toId ? [request.fromId, request.toId] : [request.toId, request.fromId];
  return { type: request.type, sourceId, targetId };
}

/** Does this edge join exactly these two items, whichever way round it was stored? */
export function joins(edge: RelationEdge, a: string, b: string): boolean {
  return (
    (edge.sourceId === a && edge.targetId === b) || (edge.sourceId === b && edge.targetId === a)
  );
}

function isDuplicate(edge: RelationEdge): boolean {
  return edge.type === WORK_RELATION_TYPE.DUPLICATE_OF;
}

/**
 * May these two be linked, and how is the row stored?
 *
 * `edges` must be every relation already touching either item, in either direction. The rules:
 *
 *  1. Nothing links to itself.
 *  2. One relation per pair. Two items are the same, or they are related, not both — and a second
 *     row for a pair that already has one is how a panel ends up saying two different things about
 *     the same two tickets.
 *  3. A duplicate points at exactly one item. "This is a copy of that" cannot be true twice.
 *  4. The item being kept must not itself be a copy of something else, and the copy must not
 *     already be the one something else was folded into. Together these keep the duplicate graph
 *     one level deep, which is what makes a cycle impossible rather than merely unlikely: there is
 *     no chain for a cycle to close. It is also the honest answer for the person — if B is already
 *     a duplicate of C then the ticket that is actually being worked is C, and that is what A
 *     should point at.
 */
export function planRelation(
  request: RelationRequest,
  edges: readonly RelationEdge[],
): RelationDecision {
  if (request.fromId === request.toId) {
    return { allowed: false, reason: 'An item cannot be linked to itself' };
  }
  if (edges.some((edge) => joins(edge, request.fromId, request.toId))) {
    return { allowed: false, reason: 'These two are already linked' };
  }
  if (request.type === WORK_RELATION_TYPE.DUPLICATE_OF) {
    const refusal = refuseDuplicate(request, edges);
    if (refusal) {
      return { allowed: false, reason: refusal };
    }
  }
  return { allowed: true, stored: orderRelationPair(request) };
}

function refuseDuplicate(request: RelationRequest, edges: readonly RelationEdge[]): string | null {
  const duplicates = edges.filter(isDuplicate);
  if (duplicates.some((edge) => edge.sourceId === request.fromId)) {
    return 'This is already marked a duplicate of something else';
  }
  if (duplicates.some((edge) => edge.sourceId === request.toId)) {
    return 'The item you picked is itself a duplicate — link to the one it points at instead';
  }
  if (duplicates.some((edge) => edge.targetId === request.fromId)) {
    return 'Something is already marked a duplicate of this one, so it cannot become a duplicate itself';
  }
  return null;
}

/**
 * The note written on the duplicate when it is closed, and the line the requester is told.
 *
 * Two clients can legitimately report the same fault, and the note lands on the *duplicate's* own
 * activity trail, which its client organization reads. So the key of the item being kept is only
 * named when both belong to the same client; otherwise the sentence says the same thing without
 * naming anything the reader may not open.
 */
export function duplicateCloseNote(input: { canonicalKey: string; sameClient: boolean }): string {
  return input.sameClient
    ? `Duplicate of ${input.canonicalKey}, which is where this is being tracked`
    : 'Duplicate of an existing ticket, which is where this is being tracked';
}
