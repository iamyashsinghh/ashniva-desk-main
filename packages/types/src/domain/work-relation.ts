/**
 * Typed links between two work items of the same kind: ticket ↔ ticket, task ↔ task.
 *
 * This is deliberately *not* the problem/recurring-issue model next door. A `Problem` is a third
 * record that several clients' tickets are grouped under so a fault can be analysed, owned and
 * closed; it is internal-only, it needs `problem:manage`, and it exists to answer "is this a fault
 * in the product". A relation answers a much smaller question the desk asks constantly — "this one
 * is the same as that one" or "these two belong together" — and it has to work for two tickets
 * from one client, and for two tasks, neither of which a problem covers.
 *
 * The two live side by side on purpose: the *candidates* offered when somebody links a duplicate
 * come from the fingerprint and keyword matcher in `ticket-similarity.ts`, so there is one
 * definition of "these look the same" and two things that can be done about it.
 */

export const WORK_RELATION_TYPE = {
  /**
   * Directed: the source is a duplicate, the target is the one being kept.
   *
   * Direction is the whole content of the statement. "A duplicates B" says B is where the work
   * happens and A is the copy, and a symmetric duplicate link would say neither.
   */
  DUPLICATE_OF: 'DUPLICATE_OF',
  /**
   * Symmetric: two items that belong together, with neither above the other.
   *
   * Stored once, with the two ids in a fixed order (see `orderRelationPair`), so that linking B to
   * A when A is already linked to B is the same row rather than a second one.
   */
  RELATED_TO: 'RELATED_TO',
} as const;

export type WorkRelationType = (typeof WORK_RELATION_TYPE)[keyof typeof WORK_RELATION_TYPE];

export const ALL_WORK_RELATION_TYPES: readonly WorkRelationType[] =
  Object.values(WORK_RELATION_TYPE);

export function isSymmetricRelation(type: WorkRelationType): boolean {
  return type === WORK_RELATION_TYPE.RELATED_TO;
}

/**
 * What one end of a relation is, from the point of view of the item being looked at.
 *
 * A screen showing ticket A needs to say "this is a duplicate of T-45" on one row and "T-52 is a
 * duplicate of this" on another. Both are the same stored row read from opposite ends, so the role
 * is computed on read rather than stored.
 */
export const WORK_RELATION_ROLE = {
  /** This item duplicates the other one. */
  DUPLICATE: 'DUPLICATE',
  /** The other item duplicates this one — this is the one being kept. */
  CANONICAL: 'CANONICAL',
  /** Neither is above the other. */
  RELATED: 'RELATED',
} as const;

export type WorkRelationRole = (typeof WORK_RELATION_ROLE)[keyof typeof WORK_RELATION_ROLE];

export const WORK_RELATION_ROLE_LABELS: Record<WorkRelationRole, string> = {
  DUPLICATE: 'Duplicate of',
  CANONICAL: 'Duplicated by',
  RELATED: 'Related to',
};

export const WORK_RELATION_TYPE_LABELS: Record<WorkRelationType, string> = {
  DUPLICATE_OF: 'Duplicate of',
  RELATED_TO: 'Related to',
};

/** The role the item at `selfId` plays in a stored relation. */
export function relationRole(
  relation: { type: WorkRelationType; sourceId: string; targetId: string },
  selfId: string,
): WorkRelationRole {
  if (relation.type === WORK_RELATION_TYPE.RELATED_TO) {
    return WORK_RELATION_ROLE.RELATED;
  }
  return relation.sourceId === selfId ? WORK_RELATION_ROLE.DUPLICATE : WORK_RELATION_ROLE.CANONICAL;
}
