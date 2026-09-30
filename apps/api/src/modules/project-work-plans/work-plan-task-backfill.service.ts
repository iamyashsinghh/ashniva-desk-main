import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ROLE_KEYS, type AuthenticatedUser } from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanTasksService } from './work-plan-tasks.service';

/** Long enough for the API to finish starting and take traffic first. */
const START_DELAY_MS = 20_000;

/**
 * Brings every existing Summary in step with the task board once the API has started: topics
 * without a task get one, and tasks whose topic has moved on (started, with the tester, sent
 * back, passed) take the matching status.
 *
 * Summaries written before topics became tasks on their own — and before task status followed
 * the Summary — are caught up this way without anyone re-saving them. It is safe to run on every
 * start: a topic that already has its task and status is left as it is.
 */
@Injectable()
export class WorkPlanTaskBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkPlanTaskBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly projects: ProjectsRepository,
    private readonly plans: WorkPlanRepository,
    private readonly planTasks: WorkPlanTasksService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    setTimeout(() => {
      this.run().catch((error: unknown) => {
        this.logger.error(`Summary → task catch-up failed: ${String(error)}`);
      });
    }, START_DELAY_MS).unref();
  }

  async run(): Promise<{ plans: number; failed: number }> {
    const plans = await this.tenantContext.runAsSystem(() =>
      this.prisma.projectWorkPlan.findMany({
        where: { project: { deletedAt: null } },
        select: {
          organizationId: true,
          projectId: true,
          project: { select: { managerUserId: true, leadUserId: true, createdById: true } },
        },
      }),
    );
    let failed = 0;
    for (const plan of plans) {
      const userId =
        plan.project.managerUserId ?? plan.project.leadUserId ?? plan.project.createdById;
      const actor: AuthenticatedUser = {
        userId,
        organizationId: plan.organizationId,
        roleKey: ROLE_KEYS.PROJECT_MANAGER,
        permissions: [],
        isServiceProvider: true,
      };
      try {
        await this.tenantContext.run({ organizationId: plan.organizationId, userId }, async () => {
          const [project, row] = await Promise.all([
            this.projects.findById(plan.organizationId, plan.projectId),
            this.plans.findByProject(plan.organizationId, plan.projectId),
          ]);
          if (project && row) {
            await this.planTasks.sync(actor, project, row);
          }
        });
      } catch (error) {
        failed += 1;
        this.logger.warn(`Could not catch up project ${plan.projectId}: ${String(error)}`);
      }
    }
    this.logger.log(`Summary → task catch-up: ${plans.length} project(s), ${failed} failed`);
    return { plans: plans.length, failed };
  }
}
