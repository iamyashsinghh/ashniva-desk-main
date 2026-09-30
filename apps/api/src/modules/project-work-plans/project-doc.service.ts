import { createHash } from 'node:crypto';

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { WORK_PLAN_POINT_STATUS, type ProjectDoc } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { ProjectRow } from '../projects/projects.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { WorkPlanGeminiService } from './work-plan-gemini';
import type { WorkPlanRow } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';

/** Changes close together (a tester passing five steps) produce one new version. */
const REFRESH_DELAY_MS = 20_000;
const DISCUSSED_LIMIT = 20;

interface DocSource {
  project: ProjectRow;
  outline: string;
  hash: string;
  plan: WorkPlanRow | null;
}

/**
 * Each project's living Markdown document: what it is, what is done, in progress and planned,
 * its structure and flow. Rebuilt from the Summary (and what was approved into it) whenever the
 * work moves — by Gemini when it is configured, otherwise written straight from the Summary.
 */
@Injectable()
export class ProjectDocService implements OnModuleDestroy {
  private readonly logger = new Logger(ProjectDocService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsRepository,
    private readonly plans: WorkPlanRepository,
    private readonly gemini: WorkPlanGeminiService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** The stored document; an out-of-date or missing one is rewritten in the background. */
  async get(organizationId: string, project: ProjectRow): Promise<ProjectDoc> {
    const [stored, source] = await Promise.all([
      this.prisma.projectDoc.findUnique({ where: { projectId: project.id } }),
      this.source(organizationId, project.id),
    ]);
    const hasWork = Boolean(source && hasTopics(source.plan));
    const stale = Boolean(source && hasWork && stored?.sourceHash !== source.hash);
    if (stale) {
      this.refreshSoon(organizationId, project.id, stored ? REFRESH_DELAY_MS : 0);
    }
    return {
      projectId: project.id,
      markdown: stored?.markdown ?? null,
      generatedAt: stored?.generatedAt.toISOString() ?? null,
      generatedBy: (stored?.generatedBy as ProjectDoc['generatedBy']) ?? null,
      stale,
      refreshing: this.running.has(project.id) || this.timers.has(project.id),
      fileName: docFileName(project),
    };
  }

  /** Rewrites the document now (the Update button). */
  async refreshNow(organizationId: string, project: ProjectRow): Promise<ProjectDoc> {
    this.cancel(project.id);
    await this.rebuild(organizationId, project.id, true);
    return this.get(organizationId, project);
  }

  /** Something in the Summary changed: write a new version shortly. Never throws. */
  refreshSoon(organizationId: string, projectId: string, delayMs = REFRESH_DELAY_MS): void {
    this.cancel(projectId);
    const timer = setTimeout(() => {
      this.timers.delete(projectId);
      void this.rebuild(organizationId, projectId, false).catch((error: unknown) => {
        this.logger.warn(
          `Project doc for ${projectId} was not rewritten: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    }, delayMs);
    timer.unref?.();
    this.timers.set(projectId, timer);
  }

  private cancel(projectId: string): void {
    const timer = this.timers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(projectId);
    }
  }

  private async rebuild(organizationId: string, projectId: string, force: boolean): Promise<void> {
    if (this.running.has(projectId)) {
      return;
    }
    this.running.add(projectId);
    try {
      const source = await this.source(organizationId, projectId);
      if (!source || !hasTopics(source.plan)) {
        return;
      }
      const stored = await this.prisma.projectDoc.findUnique({ where: { projectId } });
      if (!force && stored?.sourceHash === source.hash) {
        return;
      }
      let markdown: string | null = null;
      let generatedBy: 'AI' | 'OUTLINE' = 'OUTLINE';
      if (this.gemini.isEnabled()) {
        try {
          markdown = await this.gemini.writeProjectDoc(source.outline);
          generatedBy = 'AI';
        } catch (error) {
          this.logger.warn(
            `Gemini did not write the project doc, using the Summary outline: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }
      markdown ??= outlineMarkdown(source.project, source.plan);
      const now = new Date();
      await this.prisma.projectDoc.upsert({
        where: { projectId },
        create: {
          organizationId,
          projectId,
          markdown,
          sourceHash: source.hash,
          generatedBy,
          generatedAt: now,
        },
        update: { markdown, sourceHash: source.hash, generatedBy, generatedAt: now },
      });
    } finally {
      this.running.delete(projectId);
    }
  }

  private async source(organizationId: string, projectId: string): Promise<DocSource | null> {
    const project = await this.projects.findById(organizationId, projectId);
    if (!project) {
      return null;
    }
    const [plan, tasks, discussed] = await Promise.all([
      this.plans.findByProject(organizationId, projectId),
      this.prisma.task.findMany({
        where: { organizationId, projectId, deletedAt: null, workPlanTitleId: { not: null } },
        select: { number: true, status: true, workPlanTitleId: true },
      }),
      this.prisma.projectWorkPlanProposal.findMany({
        where: { organizationId, projectId, status: 'PUBLISHED' },
        orderBy: { decidedAt: 'desc' },
        take: DISCUSSED_LIMIT,
        select: { title: true, context: true, decidedAt: true },
      }),
    ]);
    const taskByTitle = new Map(
      tasks.map((task) => [
        task.workPlanTitleId as string,
        `${project.code}-${task.number} ${task.status}`,
      ]),
    );
    const outline = projectOutline(project, plan, taskByTitle, discussed);
    return {
      project,
      outline,
      hash: createHash('sha256').update(outline).digest('hex'),
      plan,
    };
  }
}

export function docFileName(project: { code: string }): string {
  return `${project.code.toLowerCase()}-project.md`;
}

function hasTopics(plan: WorkPlanRow | null): boolean {
  return Boolean(plan?.phases.some((phase) => phase.titles.length > 0));
}

type Title = WorkPlanRow['phases'][number]['titles'][number];

function topicState(title: Title): 'done' | 'in progress' | 'planned' {
  const steps = title.points.filter((point) => !point.isError);
  if (
    steps.length > 0 &&
    steps.every((point) => point.status === WORK_PLAN_POINT_STATUS.COMPLETED)
  ) {
    return 'done';
  }
  return title.points.some((point) => point.startedAt) ? 'in progress' : 'planned';
}

function stepState(point: Title['points'][number]): string {
  if (point.isError) {
    return point.status === WORK_PLAN_POINT_STATUS.COMPLETED ? 'error fixed' : 'error';
  }
  switch (point.status) {
    case WORK_PLAN_POINT_STATUS.COMPLETED:
      return 'done';
    case WORK_PLAN_POINT_STATUS.PENDING:
      return point.startedAt ? 'paused' : 'not started';
    default:
      return point.status.toLowerCase().replace(/_/g, ' ');
  }
}

function teamLines(project: ProjectRow): string[] {
  const byRole = new Map<string, string[]>();
  for (const member of project.members) {
    const names = byRole.get(member.role) ?? [];
    names.push(member.user.name);
    byRole.set(member.role, names);
  }
  return [
    project.manager ? `Project manager: ${project.manager.name}` : null,
    project.lead ? `Team lead: ${project.lead.name}` : null,
    ...[...byRole].map(([role, names]) => `${role.toLowerCase()}: ${names.join(', ')}`),
  ].filter((line): line is string => Boolean(line));
}

/** What the document is written from; its hash tells whether the document is up to date. */
function projectOutline(
  project: ProjectRow,
  plan: WorkPlanRow | null,
  taskByTitle: Map<string, string>,
  discussed: Array<{ title: string; context: string | null; decidedAt: Date | null }>,
): string {
  const lines = [
    `Project: ${project.name} (${project.code}), ${project.type.toLowerCase()}, status ${project.status.toLowerCase()}`,
  ];
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }
  lines.push('Team:', ...teamLines(project).map((line) => `- ${line}`), 'Summary:');
  for (const phase of plan?.phases ?? []) {
    lines.push(`Phase: ${phase.heading}`);
    for (const title of phase.titles) {
      const who = title.assignedTo?.name ?? phase.assignedTo?.name ?? plan?.assignedTo?.name;
      const task = taskByTitle.get(title.id);
      lines.push(
        `- Topic: ${title.title} [${topicState(title)}]${who ? ` developer ${who}` : ' unassigned'}${task ? ` task ${task}` : ''}`,
      );
      for (const point of title.points) {
        lines.push(`  - [${stepState(point)}] ${point.body} (${point.estimateMinutes} min)`);
      }
    }
  }
  if (discussed.length > 0) {
    lines.push('Discussed and approved:');
    for (const item of discussed) {
      const when = item.decidedAt?.toISOString().slice(0, 10) ?? '';
      lines.push(`- ${when} ${item.title}${item.context ? `: ${item.context.slice(0, 600)}` : ''}`);
    }
  }
  return lines.join('\n');
}

/** The document without AI: the same sections, straight from the Summary. */
export function outlineMarkdown(project: ProjectRow, plan: WorkPlanRow | null): string {
  const groups: Record<'done' | 'in progress' | 'planned', string[]> = {
    done: [],
    'in progress': [],
    planned: [],
  };
  const structure: string[] = [];
  const open: string[] = [];
  for (const phase of plan?.phases ?? []) {
    structure.push(`- **${phase.heading}**`);
    for (const title of phase.titles) {
      structure.push(`  - ${title.title}`);
      groups[topicState(title)].push(`- ${title.title} (${phase.heading})`);
      if (!title.assignedTo && !phase.assignedTo && !plan?.assignedTo) {
        open.push(`- ${title.title}: no developer yet`);
      }
      for (const point of title.points) {
        if (point.isError && point.status !== WORK_PLAN_POINT_STATUS.COMPLETED) {
          open.push(`- Error on ${title.title}: ${point.body}`);
        }
      }
    }
  }
  const list = (items: string[]) => (items.length > 0 ? items.join('\n') : '- None yet');
  return [
    `# ${project.name}`,
    '',
    '## Overview',
    project.description?.trim() || `${project.name} (${project.code}).`,
    '',
    '## Features',
    '### Done',
    list(groups.done),
    '',
    '### In progress',
    list(groups['in progress']),
    '',
    '### Planned',
    list(groups.planned),
    '',
    '## Structure',
    list(structure),
    '',
    '## Team',
    list(teamLines(project).map((line) => `- ${line}`)),
    '',
    '## Open items',
    list(open),
    '',
  ].join('\n');
}
