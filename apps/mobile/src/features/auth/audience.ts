import { isClientRole, type SessionUser } from '@ashniva/types';

/**
 * Which half of the system somebody is in.
 *
 * Several screens exist twice — once against an internal route and once against the portal route
 * that mirrors it — because the two return deliberately different shapes. Choosing between them
 * needs an answer to "is this person the provider or the client", and getting it from the role
 * name alone is the mistake: a custom role built on a provider template can sit in a *client*
 * organization, and a role-key check would send them to the internal endpoint.
 *
 * So both halves of the API's own test are repeated, the way `chat-access.ts` does for the
 * conversations controller. This is not the control. The internal and portal services each assert
 * the caller's side before any query runs, and refuse the other one; this only decides which door
 * the app knocks on, so nobody is handed a screen that is certain to answer 403.
 */
export function isProviderUser(user: SessionUser | null): boolean {
  return Boolean(user && !isClientRole(user.roleKey) && user.organization.isServiceProvider);
}

/** The mirror of the above: somebody the portal endpoints are for. */
export function isClientUser(user: SessionUser | null): boolean {
  return Boolean(user && !isProviderUser(user));
}
