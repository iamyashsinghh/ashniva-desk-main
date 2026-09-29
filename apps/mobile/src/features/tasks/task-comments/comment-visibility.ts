import { VISIBILITY, type CommentSummary, type Visibility } from '@ashniva/types';

export type CommentFilter = 'all' | 'internal' | 'client';

/**
 * Who a new comment is written for.
 *
 * The web app's rule: somebody without `comment:internal` — a client — can only write what the
 * client side reads, so there is no choice to offer. Staff choose, but only on a project that has
 * a client; on an internal project "client-visible" has nobody to be visible to. The API decides
 * regardless and refuses an internal comment from anybody not allowed one; this only draws the
 * switch where the switch means something.
 */
export function composerVisibility(options: {
  canInternal: boolean;
  hasClient: boolean;
  clientVisible: boolean;
}): { visibility: Visibility; canToggle: boolean } {
  const canToggle = options.canInternal && options.hasClient;
  if (!options.canInternal) {
    return { visibility: VISIBILITY.CLIENT, canToggle: false };
  }
  return {
    visibility: canToggle && options.clientVisible ? VISIBILITY.CLIENT : VISIBILITY.INTERNAL,
    canToggle,
  };
}

export function filterComments(
  comments: readonly CommentSummary[],
  filter: CommentFilter,
): CommentSummary[] {
  if (filter === 'all') {
    return [...comments];
  }
  const wanted = filter === 'client' ? VISIBILITY.CLIENT : VISIBILITY.INTERNAL;
  return comments.filter((comment) => comment.visibility === wanted);
}
