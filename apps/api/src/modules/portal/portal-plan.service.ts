import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuthenticatedUser, type PortalProjectPlan } from '@ashniva/types';

import { isClientUser } from '../../common/auth/access-scope';
import { ProjectPlanService } from '../projects/project-plan.service';
import { TicketsService } from '../tickets/tickets.service';
import { PortalProgressRepository } from './portal-progress.repository';
import { toPortalProjectPlan } from './portal.mapper';

/**
 * The project plan as a client reads it.
 *
 * The plan itself is built once, by the projects module, so the client and the team are looking
 * at the same derivation of the same records. What differs is what leaves the building:
 * `toPortalProjectPlan` names every field a client is given, and the milestones this passes it
 * are the client-visible ones only.
 */
@Injectable()
export class PortalPlanService {
  constructor(
    private readonly plan: ProjectPlanService,
    private readonly progress: PortalProgressRepository,
    private readonly tickets: TicketsService,
  ) {}

  async forProject(actor: AuthenticatedUser, projectId: string): Promise<PortalProjectPlan> {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
    const organizationId = await this.tickets.providerId(actor);
    const project = await this.progress.findProject({
      organizationId,
      clientOrganizationId: actor.organizationId,
      projectId,
    });
    if (!project) {
      // The same answer for "does not exist" and "belongs to another client".
      throw new NotFoundException('Project not found');
    }
    return toPortalProjectPlan(await this.plan.build(organizationId, projectId));
  }
}
