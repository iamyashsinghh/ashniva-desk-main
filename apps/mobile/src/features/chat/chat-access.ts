import { PERMISSIONS, isClientRole, type SessionUser } from '@ashniva/types';

/**
 * Who gets an internal chat entry point at all.
 *
 * The API refuses a client at the first check of every route on the communication controller,
 * before any query runs, and there is no client-facing shape of a conversation anywhere in the
 * system. So this function is not the control — it is the app not offering somebody a door that
 * is bolted. A client tapping "Messages" and being told 403 would be worse than the door not
 * being there, and it would suggest the feature is coming.
 *
 * Both halves of the API's own test are repeated rather than one of them. `isClientRole` catches
 * the seeded client roles; `isServiceProvider` catches a custom role in a client organization,
 * which is the case a role-name check alone would let through.
 */
export function canUseInternalChat(user: SessionUser | null): boolean {
  if (!user || isClientRole(user.roleKey) || !user.organization.isServiceProvider) {
    return false;
  }
  return user.permissions.includes(PERMISSIONS.CONVERSATION_PARTICIPATE);
}
