import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { ProjectRow } from '../projects/projects.repository';

@Injectable()
export class WorkPlanEventsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  async submittedForTest(
    actor: AuthenticatedUser,
    project: ProjectRow,
    pointBody: string,
  ): Promise<void> {
    const testers = project.members
      .filter((member) => member.role === 'TESTER')
      .map((member) => member.userId);
    await this.send(
      actor,
      project,
      NOTIFICATION_TYPE.WORK_PLAN_SUBMITTED_FOR_TEST,
      `Ready to test on ${project.code}`,
      pointBody,
      [...testers, project.leadUserId, project.managerUserId],
    );
  }

  async returned(
    actor: AuthenticatedUser,
    project: ProjectRow,
    startedById: string | null,
    body: string,
  ): Promise<void> {
    await this.send(
      actor,
      project,
      NOTIFICATION_TYPE.WORK_PLAN_RETURNED,
      `Sent back on ${project.code}`,
      body,
      [startedById, project.managerUserId, project.leadUserId],
    );
  }

  async doubt(
    actor: AuthenticatedUser,
    project: ProjectRow,
    body: string,
  ): Promise<void> {
    await this.send(
      actor,
      project,
      NOTIFICATION_TYPE.WORK_PLAN_DOUBT,
      `Doubt on ${project.code}`,
      body,
      [project.managerUserId, project.leadUserId],
    );
  }

  async reply(
    actor: AuthenticatedUser,
    project: ProjectRow,
    body: string,
    userIds: Array<string | null | undefined>,
  ): Promise<void> {
    await this.send(
      actor,
      project,
      NOTIFICATION_TYPE.WORK_PLAN_DOUBT,
      `Reply on ${project.code}`,
      body,
      userIds,
    );
  }

  async assigned(
    actor: AuthenticatedUser,
    project: ProjectRow,
    userId: string,
    scopeLabel: string,
  ): Promise<void> {
    await this.send(
      actor,
      project,
      NOTIFICATION_TYPE.WORK_PLAN_ASSIGNED,
      `Assigned ${scopeLabel} on ${project.code}`,
      `You were given ${scopeLabel} on ${project.name}.`,
      [userId],
    );
  }

  private async send(
    actor: AuthenticatedUser,
    project: ProjectRow,
    type: (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE],
    title: string,
    body: string,
    userIds: Array<string | null | undefined>,
  ): Promise<void> {
    await this.dispatcher.notify({
      type,
      title,
      body,
      link: `/projects/${project.id}`,
      entityType: 'project',
      entityId: project.id,
      dedupeKey: `work-plan:${type}:${project.id}:${actor.userId}:${body.slice(0, 24)}`,
      recipients: await this.recipients.members(actor.organizationId, userIds),
      excludeUserId: actor.userId,
    });
  }
}
