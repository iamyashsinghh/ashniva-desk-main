import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

/**
 * "Which tasks may this person open?", as a predicate this module can `AND` into a query.
 *
 * A link is a disclosure — knowing task A points at task B teaches the reader that B exists, what
 * it is called and who is on it — so every task this module reads, writes to or masks has to be
 * narrowed by the same rule that governs opening it directly. That rule is not this module's to
 * define: it belongs to whoever owns tasks. So it arrives here through this interface instead.
 *
 * The signature is deliberately identical to `TaskVisibilityService.taskWhere` on
 * `feat/task-visibility`, down to the `undefined`-means-everything convention, so that service
 * satisfies this interface structurally. Binding the two is two lines in `RelationsModule` —
 * import `TaskVisibilityModule`, and
 * `{ provide: TASK_SCOPE, useExisting: TaskVisibilityService }` — with no adapter class and no
 * second copy of the rule. Until then `OrganizationTaskScope` below answers what this branch's own
 * `GET /tasks/:id` answers, so the two agree at every point in time.
 */
export interface TaskScopeProvider {
  /**
   * The narrowing predicate, or `undefined` when the actor may read every task in the tenant.
   *
   * `undefined` rather than an empty object because an absent filter and a filter that matches
   * everything read the same at a call site, and only one of them survives being combined with a
   * `where` that already carries an `OR`.
   */
  taskWhere(actor: AuthenticatedUser): Promise<Prisma.TaskWhereInput | undefined>;
}

/** Injection token for {@link TaskScopeProvider}. */
export const TASK_SCOPE = Symbol('RELATIONS_TASK_SCOPE');

/**
 * The scope this branch ships with: the tenant, and nothing narrower.
 *
 * It is not a second implementation of task visibility — it is the honest statement that on this
 * branch there is none, because `TasksService.get` and `?view=all` are themselves tenant-only here.
 * The value of the seam is that the relations endpoints *ask*, so the narrowing lands in one place
 * the moment somebody has a narrower answer to give. `relations.e2e` binds a stub to this token to
 * prove the endpoints honour a "no" rather than merely asking politely.
 */
@Injectable()
export class OrganizationTaskScope implements TaskScopeProvider {
  taskWhere(): Promise<Prisma.TaskWhereInput | undefined> {
    return Promise.resolve(undefined);
  }
}
