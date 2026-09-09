import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CLIENT_UPDATE_STATUS,
  type AuthenticatedUser,
  type ClientUpdateStatus,
  type ClientUpdateSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { REALTIME_EVENTS } from '../../infrastructure/realtime/realtime-rooms';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { boundedList } from '../../common/dto/unpaginated-list';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import { ClientUpdatesRepository, type ClientUpdateRow } from './client-updates.repository';
import type { EditClientUpdateDto, ListClientUpdatesQueryDto } from './dto/client-update.dto';

export function toClientUpdateSummary(row: ClientUpdateRow): ClientUpdateSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as ClientUpdateStatus,
    workDate: row.workDate.toISOString().slice(0, 10),
    project: row.project,
    clientOrganization: row.clientOrganization,
    task: row.task
      ? {
          id: row.task.id,
          key: `${row.task.project.code}-${row.task.number}`,
          title: row.task.title,
        }
      : null,
    ticket: row.ticket,
    author: row.author,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The publish queue behind "Completed Today". Updates are created by the task workflow when a
 * client-visible task is approved; only seniors / managers (client-update:publish) release them
 * to the client portal.
 */
@Injectable()
export class ClientUpdatesService {
  constructor(
    private readonly updates: ClientUpdatesRepository,
    private readonly auditLog: AuditLogService,
    private readonly realtime: RealtimeService,
    private readonly visibility: TaskVisibilityService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListClientUpdatesQueryDto,
  ): Promise<ClientUpdateSummary[]> {
    this.assertInternal(actor);
    // `task:read` is the only gate on this route, so without the scope the publish queue was every
    // developer's window onto the whole organization's completed work.
    const rows = await this.updates.list({
      organizationId: actor.organizationId,
      visibility: await this.visibility.clientUpdateWhere(actor),
      clientOrganizationId: query.clientOrganizationId,
      projectId: query.projectId,
      status: query.status ? [query.status] : undefined,
      workDateFrom: query.date ? new Date(query.date) : undefined,
      workDateTo: query.date ? new Date(query.date) : undefined,
    });
    return boundedList('GET /client-updates', rows.map(toClientUpdateSummary));
  }

  async edit(
    actor: AuthenticatedUser,
    id: string,
    dto: EditClientUpdateDto,
  ): Promise<ClientUpdateSummary> {
    const before = await this.require(actor, id);
    if (before.status === CLIENT_UPDATE_STATUS.PUBLISHED) {
      throw new ConflictException('Published updates cannot be edited; withdraw it first');
    }
    const row = await this.updates.update(id, dto);
    return toClientUpdateSummary(row);
  }

  async publish(actor: AuthenticatedUser, id: string): Promise<ClientUpdateSummary> {
    const before = await this.require(actor, id);
    if (before.status === CLIENT_UPDATE_STATUS.PUBLISHED) {
      throw new ConflictException('This update is already published');
    }
    const row = await this.updates.update(id, {
      status: CLIENT_UPDATE_STATUS.PUBLISHED,
      publishedById: actor.userId,
      publishedAt: new Date(),
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.CLIENT_UPDATE_PUBLISHED,
      entityType: AUDIT_ENTITY_TYPE.CLIENT_UPDATE,
      entityId: id,
      after: {
        title: row.title,
        clientOrganizationId: row.clientOrganizationId,
        projectId: row.projectId,
      },
    });
    // The client organization's portal sees it immediately.
    this.realtime.emitToOrganization(row.clientOrganizationId, REALTIME_EVENTS.UPDATE_PUBLISHED, {
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      changedByUserId: actor.userId,
      at: new Date().toISOString(),
    });
    return toClientUpdateSummary(row);
  }

  async withdraw(actor: AuthenticatedUser, id: string): Promise<ClientUpdateSummary> {
    const before = await this.require(actor, id);
    if (before.status === CLIENT_UPDATE_STATUS.WITHDRAWN) {
      throw new ConflictException('This update is already withdrawn');
    }
    const row = await this.updates.update(id, {
      status: CLIENT_UPDATE_STATUS.WITHDRAWN,
      publishedById: null,
      publishedAt: null,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.CLIENT_UPDATE_WITHDRAWN,
      entityType: AUDIT_ENTITY_TYPE.CLIENT_UPDATE,
      entityId: id,
      before: { status: before.status },
      after: { status: row.status },
    });
    return toClientUpdateSummary(row);
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<ClientUpdateRow> {
    this.assertInternal(actor);
    const row = await this.updates.findById(
      actor.organizationId,
      id,
      await this.visibility.clientUpdateWhere(actor),
    );
    if (!row) {
      throw new NotFoundException('Client update not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients read published updates through the portal');
    }
  }
}
