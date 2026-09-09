import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TASK_STATUS, type AuthenticatedUser, type ProjectPlan } from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { toTaskCounts } from './projects.mapper';
import { toProjectPlan } from './project-plan.mapper';
import { ProjectPlanRepository } from './project-plan.repository';
import { ProjectsRepository } from './projects.repository';

/**
 * The plan of one project: its milestones and the work grouped under them, on a calendar.
 *
 * There is no plan table. Everything here is read from the project, its milestones, their
 * deliverables and the tasks that point at a milestone, and computed on the way out — so the
 * plan, the project list and the client portal cannot drift apart, and nobody has to remember to
 * update a percentage.
 *
 * `build` is the single reader; the client portal calls it too, and narrows what comes back
 * through its own allow-list mapper.
 */
@Injectable()
export class ProjectPlanService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly plan: ProjectPlanRepository,
  ) {}

  /** The internal plan. Same scope as `GET /projects/:id`: internal staff, own tenant only. */
  async forProject(actor: AuthenticatedUser, projectId: string): Promise<ProjectPlan> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients use the portal to see their projects');
    }
    return this.build(actor.organizationId, projectId);
  }

  /**
   * The plan of a project in `organizationId`. The caller has already decided that whoever is
   * asking may see this project — the portal checks the client organization, the internal route
   * checks the tenant — so this method only reads.
   */
  async build(organizationId: string, projectId: string): Promise<ProjectPlan> {
    const project = await this.projects.findById(organizationId, projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const [milestones, groups, counts] = await Promise.all([
      this.plan.milestones(organizationId, projectId),
      this.plan.taskGroups(organizationId, projectId),
      this.projects.countsByProject(organizationId, [projectId]),
    ]);
    const projectCounts = counts.get(projectId) ?? { byStatus: {}, overdue: 0, openTickets: 0 };
    return toProjectPlan({
      project,
      milestones,
      groups,
      taskCounts: toTaskCounts(projectCounts),
      cancelledTasks: projectCounts.byStatus[TASK_STATUS.CANCELLED] ?? 0,
      today: new Date(new Date().toISOString().slice(0, 10)),
    });
  }
}
