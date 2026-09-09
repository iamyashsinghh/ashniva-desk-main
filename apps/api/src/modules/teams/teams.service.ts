import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type TeamSummary,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateTeamDto, SetTeamMembersDto, UpdateTeamDto } from './dto/team.dto';
import { TeamsRepository, type TeamRow } from './teams.repository';

export function toTeamSummary(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lead: row.lead,
    members: row.members.map((member) => member.user),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Teams live inside the caller's organization; nothing here crosses tenants. */
@Injectable()
export class TeamsService {
  constructor(
    private readonly teams: TeamsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<TeamSummary[]> {
    const rows = await this.teams.list(actor.organizationId);
    return rows.map(toTeamSummary);
  }

  async get(actor: AuthenticatedUser, id: string): Promise<TeamSummary> {
    return toTeamSummary(await this.require(actor, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateTeamDto): Promise<TeamSummary> {
    if (await this.teams.findByName(actor.organizationId, dto.name)) {
      throw new ConflictException(`A team called "${dto.name}" already exists`);
    }
    const created = await this.teams.create(actor.organizationId, {
      name: dto.name,
      description: dto.description ?? null,
      leadUserId: dto.leadUserId ?? null,
    });
    const memberIds = new Set(dto.memberIds ?? []);
    if (dto.leadUserId) {
      memberIds.add(dto.leadUserId);
    }
    await this.teams.setMembers(actor.organizationId, created.id, [...memberIds]);
    await this.auditLog.record({
      action: AUDIT_ACTION.TEAM_CREATED,
      entityType: AUDIT_ENTITY_TYPE.TEAM,
      entityId: created.id,
      after: { name: created.name, leadUserId: created.leadUserId },
    });
    return this.get(actor, created.id);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTeamDto): Promise<TeamSummary> {
    const before = await this.require(actor, id);
    if (dto.name && dto.name !== before.name) {
      if (await this.teams.findByName(actor.organizationId, dto.name)) {
        throw new ConflictException(`A team called "${dto.name}" already exists`);
      }
    }
    const row = await this.teams.update(id, dto);
    await this.auditLog.record({
      action: AUDIT_ACTION.TEAM_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.TEAM,
      entityId: id,
      before: { name: before.name, leadUserId: before.leadUserId },
      after: { name: row.name, leadUserId: row.leadUserId },
    });
    return toTeamSummary(row);
  }

  async setMembers(
    actor: AuthenticatedUser,
    id: string,
    dto: SetTeamMembersDto,
  ): Promise<TeamSummary> {
    await this.require(actor, id);
    await this.teams.setMembers(actor.organizationId, id, [...new Set(dto.userIds)]);
    await this.auditLog.record({
      action: AUDIT_ACTION.TEAM_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.TEAM,
      entityId: id,
      after: { memberIds: dto.userIds },
    });
    return this.get(actor, id);
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<TeamRow> {
    const row = await this.teams.findById(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Team not found');
    }
    return row;
  }
}
