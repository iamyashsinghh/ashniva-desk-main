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

  /**
   * Writes the phase tree without wiping timers, notes, assignees or linked tasks.
   * Existing rows keep their ids; new rows are created; omitted unfinished rows are deleted.
   */
  async savePhases(
    organizationId: string,
    projectId: string,
    createdById: string,
    source: ProjectWorkPlanSource,
    sourceFileId: string | null,
    phases: WorkPlanPhaseDto[],
  ): Promise<WorkPlanRow> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectWorkPlan.findFirst({
          where: { organizationId, projectId },
          include: {
            phases: {
              include: {
                titles: {
                  include: {
                    points: {
                      select: { id: true, startedAt: true, isError: true, estimateMinutes: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!existing) {
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
        }

        await tx.projectWorkPlan.update({
          where: { id: existing.id },
          data: { source, sourceFileId },
        });

        const phaseById = new Map(existing.phases.map((phase) => [phase.id, phase]));
        const titleById = new Map(
          existing.phases.flatMap((phase) =>
            phase.titles.map((title) => [title.id, title] as const),
          ),
        );
        const pointById = new Map(
          existing.phases.flatMap((phase) =>
            phase.titles.flatMap((title) =>
              title.points.map((point) => [point.id, point] as const),
            ),
          ),
        );
        const keptPhaseIds = new Set<string>();
        const keptTitleIds = new Set<string>();
        const keptPointIds = new Set<string>();

        for (const [phaseIndex, phase] of phases.entries()) {
          const knownPhase = phase.id ? phaseById.get(phase.id) : undefined;
          const phaseId = knownPhase
            ? knownPhase.id
            : (
                await tx.projectWorkPlanPhase.create({
                  data: {
                    planId: existing.id,
                    heading: phase.heading.trim(),
                    sortOrder: phaseIndex,
                  },
                })
              ).id;
          keptPhaseIds.add(phaseId);
          if (knownPhase) {
            await tx.projectWorkPlanPhase.update({
              where: { id: phaseId },
              data: { heading: phase.heading.trim(), sortOrder: phaseIndex },
            });
          }

          for (const [titleIndex, title] of phase.titles.entries()) {
            const knownTitle = title.id ? titleById.get(title.id) : undefined;
            const titleId = knownTitle
              ? knownTitle.id
              : (
                  await tx.projectWorkPlanTitle.create({
                    data: {
                      phaseId,
                      title: title.title.trim(),
                      sortOrder: titleIndex,
                    },
                  })
                ).id;
            keptTitleIds.add(titleId);
            if (knownTitle) {
              await tx.projectWorkPlanTitle.update({
                where: { id: titleId },
                data: { title: title.title.trim(), sortOrder: titleIndex, phaseId },
              });
            }

            for (const [pointIndex, point] of title.points.entries()) {
              const knownPoint = point.id ? pointById.get(point.id) : undefined;
              if (knownPoint) {
                keptPointIds.add(knownPoint.id);
                await tx.projectWorkPlanPoint.update({
                  where: { id: knownPoint.id },
                  data: {
                    body: point.body.trim(),
                    estimateMinutes: knownPoint.isError
                      ? knownPoint.estimateMinutes
                      : point.estimateMinutes,
                    sortOrder: pointIndex,
                    titleId,
                  },
                });
                continue;
              }
              // New steps from Edit / add-on — never create tester-error rows via save.
              const created = await tx.projectWorkPlanPoint.create({
                data: {
                  titleId,
                  body: point.body.trim(),
                  estimateMinutes: point.estimateMinutes,
                  sortOrder: pointIndex,
                },
              });
              keptPointIds.add(created.id);
            }
          }
        }

        for (const point of pointById.values()) {
          if (keptPointIds.has(point.id)) {
            continue;
          }
          // Assigners may remove started or completed steps when editing the plan.
          await tx.projectWorkPlanPoint.delete({ where: { id: point.id } });
        }
        for (const title of titleById.values()) {
          if (keptTitleIds.has(title.id)) {
            continue;
          }
          await tx.projectWorkPlanTitle.delete({ where: { id: title.id } });
        }
        for (const phase of phaseById.values()) {
          if (keptPhaseIds.has(phase.id)) {
            continue;
          }
          await tx.projectWorkPlanPhase.delete({ where: { id: phase.id } });
        }

        return tx.projectWorkPlan.findFirstOrThrow({
          where: { id: existing.id },
          include: workPlanInclude,
        });
      },
      { timeout: 20_000 },
    );
  }
}
