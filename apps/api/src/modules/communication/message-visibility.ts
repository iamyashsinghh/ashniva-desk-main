import { readsEveryTaggedMessage, type AuthenticatedUser } from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

/**
 * Who may read a tagged group message, as a query and as a check on a row already loaded.
 *
 * One file for both because they are one rule: the thread filters with the first, and a reply's
 * quoted original — which arrives through a relation, not a filtered query — is judged with the
 * second. If they ever disagreed, a quote would become a way to read a line the thread hides.
 */

/** Who is reading, as far as tagged group messages are concerned. */
export interface MessageViewer {
  userId: string;
  /** Holds a tagged-message reader role, so no restricted message is hidden from them. */
  readsEveryTagged: boolean;
}

export function messageViewerOf(actor: AuthenticatedUser): MessageViewer {
  return { userId: actor.userId, readsEveryTagged: readsEveryTaggedMessage(actor.roleKey) };
}

/** The messages this viewer may see: unrestricted ones, their own, and those that tag them. */
export function visibleMessagesWhere(viewer: MessageViewer): Prisma.MessageWhereInput {
  if (viewer.readsEveryTagged) {
    return {};
  }
  return {
    OR: [
      { restrictedToUserIds: { isEmpty: true } },
      { senderId: viewer.userId },
      { restrictedToUserIds: { has: viewer.userId } },
    ],
  };
}

/** `visibleMessagesWhere` for one row in memory: the same three clauses, in the same order. */
export function mayViewMessage(
  viewer: MessageViewer,
  message: { senderId: string | null; restrictedToUserIds: readonly string[] },
): boolean {
  return (
    viewer.readsEveryTagged ||
    message.restrictedToUserIds.length === 0 ||
    message.senderId === viewer.userId ||
    message.restrictedToUserIds.includes(viewer.userId)
  );
}
