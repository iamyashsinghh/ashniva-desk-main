import { Injectable } from '@nestjs/common';
import type { ProjectWorkPlanSource } from '../../generated/prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { workPlanInclude, type WorkPlanRow } from './work-plan.mapper';
import type { WorkPlanPhaseDto } from './dto/work-plan.dto';

@Injectable()
export class WorkPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProject(organizationId: string, projectId: string): Promise<WorkPlanRow | null> {
    return this.prisma.projectWorkPlan.findFirst({
      where: { organizationId, projectId },
      include: workPlanInclude,
    });
  }

  findPoint(organizationId: string, projectId: string, pointId: string) {
    return this.prisma.projectWorkPlanPoint.findFirst({
      where: {
        id: pointId,
        title: { phase: { plan: { organizationId, projectId } } },
      },
      include: {
        startedBy: { select: { id: true, name: true, email: true } },
        title: {
          select: {
            assignedToId: true,
            phase: {
              select: {
                planId: true,
                assignedToId: true,
                plan: { select: { assignedToId: true } },
              },
            },
          },
        },
        notes: { include: { author: { select: { id: true, name: true, email: true } } } },
      },
    });
  }

  async replace(
    organizationId: string,
    projectId: string,
    createdById: string,
    source: ProjectWorkPlanSource,
    sourceFileId: string | null,
    phases: WorkPlanPhaseDto[],
  ): Promise<WorkPlanRow> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectWorkPlan.findFirst({
        where: { organizationId, projectId },
        select: { id: true },
      });
      if (existing) {
        await tx.projectWorkPlan.delete({ where: { id: existing.id } });
      }
      return tx.projectWorkPlan.create({
        data: {
          organizationId,
          projectId,
          createdById,
          source,
          sourceFileId,
          phases: {
            create: phases.map((phase, phaseIndex) => ({
              heading: phase.heading.trim(),
              sortOrder: phaseIndex,
              titles: {
                create: phase.titles.map((title, titleIndex) => ({
                  title: title.title.trim(),
                  sortOrder: titleIndex,
                  points: {
                    create: title.points.map((point, pointIndex) => ({
                      body: point.body.trim(),
                      estimateMinutes: point.estimateMinutes,
                      sortOrder: pointIndex,
                    })),
                  },
                })),
              },
            })),
          },
        },
        include: workPlanInclude,
      });
    });
  }
}
