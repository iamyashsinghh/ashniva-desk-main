import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  MAX_RELATIONS_PER_ITEM,
  PERMISSIONS,
  planRelation,
  type AuthenticatedUser,
  type RelationEdge,
  type TaskRelationsResponse,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateTaskRelationDto } from './dto/relation.dto';
import { otherTaskId, toTaskRelationView } from './relations.mapper';
import { RelationsRepository, type TaskRelationRow } from './relations.repository';
import { TASK_SCOPE, type TaskScopeProvider } from './task-scope';

/**
 * The same relation model, applied to tasks.
 *
 * Everything that decides anything is shared with the ticket side: `planRelation` in
 * `@ashniva/types` answers "may these be linked", `RelationsRepository` owns both tables, and the
 * mapper turns a stored row into what one end of it sees. What is different is only what a task is
 * — internal, with no client-facing read anywhere in the product — so there is no cross-client case
 * to redact and no closure to perform: a duplicate task is a pointer, and cancelling one is the
 * task workflow's own decision, taken on the task screen.
 *
 * Nothing here reaches into `modules/tasks`. That module is being changed on another branch, and a
 * relation is an addition beside a task rather than a change to one — the rule for *which* tasks a
 * person may open arrives through the `TASK_SCOPE` seam instead of being restated here.
 *
 * That scope is applied to all four things a link touches, because a permission gate on the
 * controller is not a scope gate: the anchor of a read, the anchor of a write or a delete, and the
 * far end that gets rendered. An anchor outside the scope is a 404, exactly as `GET /tasks/:id`
 * is; a far end outside it is `other: null`, with no id and no title.
 */
@Injectable()
export class TaskRelationsService {
  constructor(
    private readonly relations: RelationsRepository,
    private readonly auditLog: AuditLogService,
    @Inject(TASK_SCOPE) private readonly scope: TaskScopeProvider,
  ) {}

  async list(actor: AuthenticatedUser, taskId: string): Promise<TaskRelationsResponse> {
    const organizationId = this.assertInternal(actor);
    // Resolved once for the request and reused for the anchor and every far end, so a scope that
    // reads several tables is one round trip and cannot answer differently halfway through.
    const scope = await this.scope.taskWhere(actor);
    await this.requireTask(organizationId, taskId, scope);
    const rows = await this.relations.taskRelations(organizationId, taskId, MAX_RELATIONS_PER_ITEM);
    const readable = await this.relations.readableTasks(
      organizationId,
      rows.map((row) => otherTaskId(row, taskId)),
      scope,
    );
    const byId = new Map(readable.map((row) => [row.id, row]));
    return {
      relations: rows.map((row) => toTaskRelationView(row, taskId, byId)),
      canLink: this.mayLink(actor),
    };
  }

  async link(
    actor: AuthenticatedUser,
    taskId: string,
    dto: CreateTaskRelationDto,
  ): Promise<TaskRelationsResponse> {
    const organizationId = this.assertMayLink(actor);
    // Both ends, because writing a link onto a task the caller cannot open is a write they may not
    // make, and naming one they cannot open is a disclosure the response would carry back.
    const scope = await this.scope.taskWhere(actor);
    await this.requireTask(organizationId, taskId, scope);
    await this.requireTask(organizationId, dto.targetTaskId, scope);

    const edges = await this.relations.taskEdgesFor(organizationId, [taskId, dto.targetTaskId]);
    const decision = planRelation(
      { type: dto.type, fromId: taskId, toId: dto.targetTaskId },
      edges.map(toEdge),
    );
    if (!decision.allowed) {
      throw new ConflictException(decision.reason);
    }
    const row = await this.relations.createTaskRelation({
      organizationId,
      type: decision.stored.type,
      sourceTaskId: decision.stored.sourceId,
      targetTaskId: decision.stored.targetId,
      note: dto.note ?? null,
      linkedById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.TASK_LINKED,
      entityType: AUDIT_ENTITY_TYPE.TASK,
      entityId: taskId,
      organizationId,
      after: {
        relationId: row.id,
        type: row.type,
        sourceTaskId: row.sourceTaskId,
        targetTaskId: row.targetTaskId,
      },
    });
    return this.list(actor, taskId);
  }

  async unlink(
    actor: AuthenticatedUser,
    taskId: string,
    relationId: string,
  ): Promise<TaskRelationsResponse> {
    const organizationId = this.assertMayLink(actor);
    await this.requireTask(organizationId, taskId, await this.scope.taskWhere(actor));
    const row = await this.relations.findTaskRelation(organizationId, relationId);
    if (!row || (row.sourceTaskId !== taskId && row.targetTaskId !== taskId)) {
      throw new NotFoundException('Link not found');
    }
    await this.relations.deleteTaskRelation(organizationId, relationId);
    await this.auditLog.record({
      action: AUDIT_ACTION.TASK_UNLINKED,
      entityType: AUDIT_ENTITY_TYPE.TASK,
      entityId: taskId,
      organizationId,
      before: {
        relationId: row.id,
        type: row.type,
        sourceTaskId: row.sourceTaskId,
        targetTaskId: row.targetTaskId,
      },
    });
    return this.list(actor, taskId);
  }

  private mayLink(actor: AuthenticatedUser): boolean {
    // `task:create` and not a new permission: relating two tasks is a smaller act than making one,
    // it is held by everyone who plans work, and it is not in CLIENT_SAFE_PERMISSIONS.
    return isInternalUser(actor) && actor.permissions.includes(PERMISSIONS.TASK_CREATE);
  }

  private assertMayLink(actor: AuthenticatedUser): string {
    const organizationId = this.assertInternal(actor);
    if (!this.mayLink(actor)) {
      throw new ForbiddenException('Linking tasks needs task:create');
    }
    return organizationId;
  }

  /** Tasks are internal, everywhere in the product. The client branch does not exist to get wrong. */
  private assertInternal(actor: AuthenticatedUser): string {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Tasks are internal');
    }
    return actor.organizationId;
  }

  /**
   * The anchor of a read, a write or a delete.
   *
   * Out of scope is reported as "not found" and never as a refusal, so that the relations routes
   * answer a task the caller may not open exactly as `GET /tasks/:id` does and an id cannot be
   * probed through them.
   */
  private async requireTask(
    organizationId: string,
    taskId: string,
    scope: Prisma.TaskWhereInput | undefined,
  ): Promise<void> {
    const [task] = await this.relations.readableTasks(organizationId, [taskId], scope);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }
}

function toEdge(row: TaskRelationRow): RelationEdge {
  return { type: row.type, sourceId: row.sourceTaskId, targetId: row.targetTaskId };
}
