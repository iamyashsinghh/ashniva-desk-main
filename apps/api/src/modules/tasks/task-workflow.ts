import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  TASK_ACTION,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  canTransitionTask,
  type AuthenticatedUser,
  type TaskAction,
  type TaskActionAvailability,
  type TaskStatus,
  isUpcoming,
} from '@ashniva/types';

/** The slice of a task the workflow rules need. */
export interface WorkflowTask {
  status: TaskStatus;
  assignedToId: string | null;
  createdById: string;
  reviewerId: string | null;
  testerId: string | null;
  startedAt: Date | null;
  /** When the work is meant to begin. Null means it can be picked up now. */
  scheduledStartAt?: Date | null;
}

type Actor = Pick<AuthenticatedUser, 'userId' | 'permissions'>;

const S = TASK_STATUS;
const A = TASK_ACTION;

/** The status each action moves the task into (assign and edit keep the status). */
export const ACTION_TARGET_STATUS: Partial<Record<TaskAction, TaskStatus>> = {
  [A.START]: S.IN_PROGRESS,
  [A.BLOCK]: S.BLOCKED,
  [A.SUBMIT]: S.IN_REVIEW,
  [A.APPROVE]: S.COMPLETED,
  [A.REJECT]: S.RETURNED_TO_DEV,
  [A.REOPEN]: S.REOPENED,
  [A.CANCEL]: S.CANCELLED,
};

/** Unblocking returns the task to where it was: in progress if work had started, else assigned. */
export function unblockTarget(task: WorkflowTask): TaskStatus {
  return task.startedAt ? S.IN_PROGRESS : S.ASSIGNED;
}

function has(actor: Actor, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]): boolean {
  return actor.permissions.includes(permission);
}

function isAssignee(task: WorkflowTask, actor: Actor): boolean {
  return task.assignedToId !== null && task.assignedToId === actor.userId;
}

/**
 * Managing a task is the `task:assign` permission, and nothing else.
 *
 * Creating one used to count too, which quietly handed every task's management to whoever typed it
 * in: DEVELOPER holds `task:create`, so a developer could raise a task, then block, unblock,
 * reopen and edit it — including retargeting somebody else's work — with none of the permissions
 * those actions are supposed to need. The one thing a creator genuinely needs is to put the task
 * they have just written in front of somebody, and that is handled in the ASSIGN case below,
 * bounded to a task still in DRAFT.
 *
 * The permission is the *ability*; it is not the *reach*. It was the whole answer once, and that
 * meant anyone with `task:assign` could edit, block, reopen or reassign any task in the
 * organization by id — including work they could not legitimately list. Reach is now settled
 * before this function is reached: every write path loads its task through
 * `TasksService.requireSummary`, which applies `TaskVisibilityService`'s scope, so a task the
 * actor may not read is a 404 and never arrives here. Keep it that way — a mutation that fetches
 * its own row unscoped puts the hole back.
 */
function isManager(actor: Actor): boolean {
  return has(actor, PERMISSIONS.TASK_ASSIGN);
}

/** The creator's one remaining power: handing over a draft they have not given to anyone yet. */
function isCreatorOfDraft(task: WorkflowTask, actor: Actor): boolean {
  return task.status === S.DRAFT && task.createdById === actor.userId;
}

function isReviewer(task: WorkflowTask, actor: Actor): boolean {
  return (
    task.testerId === actor.userId ||
    task.reviewerId === actor.userId ||
    has(actor, PERMISSIONS.TASK_REVIEW)
  );
}

/**
 * Explains, for one action, whether the actor may perform it on the task right now and, if not,
 * why. Status checks use the shared transition map; role checks are the Phase 1 rules:
 *  - only the assignee starts, submits and logs work on a task;
 *  - the tester, the reviewer or anyone with task:review decides a review — never the assignee;
 *  - people who can assign (seniors, PM, admin) manage the rest; a task's creator may hand over
 *    and edit their own draft, and nothing beyond that.
 */
export function explainAction(
  task: WorkflowTask,
  actor: Actor,
  action: TaskAction,
): TaskActionAvailability {
  const disabled = (reason: string): TaskActionAvailability => ({ action, enabled: false, reason });
  const statusLabel = TASK_STATUS_LABELS[task.status];
  const target = ACTION_TARGET_STATUS[action];
  if (target && !canTransitionTask(task.status, target)) {
    return disabled(`Not available while the task is ${statusLabel.toLowerCase()}`);
  }

  switch (action) {
    case A.ASSIGN:
      if (task.status === S.COMPLETED || task.status === S.CANCELLED) {
        return disabled(`Closed tasks cannot be reassigned`);
      }
      if (!isManager(actor) && !isCreatorOfDraft(task, actor)) {
        return disabled(
          'Only seniors and managers can assign this task — its creator only while it is a draft',
        );
      }
      return { action, enabled: true };
    case A.START:
    case A.SUBMIT:
      if (!has(actor, PERMISSIONS.TASK_WORK)) {
        return disabled('Your role cannot work on tasks');
      }
      if (!isAssignee(task, actor)) {
        return disabled('Only the assignee can do this');
      }
      // A task scheduled for later is assigned but not yet workable. Enforced here rather than
      // only hidden in the queue, because a scheduled start that the API does not defend is a
      // suggestion: the button would be gone and the endpoint would still take the call.
      if (action === A.START && isUpcoming(task.scheduledStartAt ?? null)) {
        return disabled('This task is scheduled to start later');
      }
      return { action, enabled: true };
    case A.BLOCK:
      if (!isAssignee(task, actor) && !isManager(actor)) {
        return disabled('Only the assignee or a manager can block this task');
      }
      return { action, enabled: true };
    case A.UNBLOCK:
      if (task.status !== S.BLOCKED) {
        return disabled('The task is not blocked');
      }
      if (!isAssignee(task, actor) && !isManager(actor)) {
        return disabled('Only the assignee or a manager can unblock this task');
      }
      return { action, enabled: true };
    case A.APPROVE:
    case A.REJECT:
      if (isAssignee(task, actor)) {
        return disabled('You cannot review your own work');
      }
      if (!isReviewer(task, actor)) {
        return disabled('Only the assigned tester, reviewer or a manager can review');
      }
      return { action, enabled: true };
    case A.REOPEN:
      if (!isManager(actor) && !isReviewer(task, actor)) {
        return disabled('Only a manager, reviewer or tester can reopen a completed task');
      }
      return { action, enabled: true };
    case A.CANCEL:
      if (!has(actor, PERMISSIONS.TASK_CANCEL)) {
        return disabled('Your role cannot cancel tasks');
      }
      return { action, enabled: true };
    case A.EDIT:
      if (task.status === S.CANCELLED) {
        return disabled('Cancelled tasks cannot be edited');
      }
      if (!isManager(actor) && !isCreatorOfDraft(task, actor)) {
        return disabled('Only a manager can edit this task — its creator only while it is a draft');
      }
      return { action, enabled: true };
    case A.LOG_WORK:
      if (task.status === S.DRAFT || task.status === S.CANCELLED || task.status === S.COMPLETED) {
        return disabled(`Time cannot be logged on a ${statusLabel.toLowerCase()} task`);
      }
      if (!isAssignee(task, actor) && !has(actor, PERMISSIONS.TASK_ASSIGN)) {
        return disabled('Only the assignee can log time on this task');
      }
      return { action, enabled: true };
    default:
      return disabled('Unknown action');
  }
}

export function listActions(task: WorkflowTask, actor: Actor): TaskActionAvailability[] {
  return Object.values(A).map((action) => explainAction(task, actor, action));
}

/** Throws the right HTTP error (409 for a status problem, 403 for a role problem). */
export function assertAction(task: WorkflowTask, actor: Actor, action: TaskAction): void {
  const availability = explainAction(task, actor, action);
  if (availability.enabled) {
    return;
  }
  const target = ACTION_TARGET_STATUS[action];
  const statusProblem = target !== undefined && !canTransitionTask(task.status, target);
  // "Not yet" is a conflict, not a refusal of the person: the same caller may do this later, and
  // answering 403 would tell them to go and find someone with more permission.
  const tooEarly = action === A.START && isUpcoming(task.scheduledStartAt ?? null);
  if (statusProblem || tooEarly || (action === A.UNBLOCK && task.status !== S.BLOCKED)) {
    throw new ConflictException(availability.reason);
  }
  throw new ForbiddenException(availability.reason);
}
