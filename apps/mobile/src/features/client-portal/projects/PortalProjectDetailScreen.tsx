import { PROJECT_STATUS_LABELS, type PortalProjectDetail } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useResource } from '../../../shared/api/queries';
import { Chip, ChipScroller } from '../../../shared/components/chips';
import { MetaLine } from '../../../shared/components/data-display';
import { Hero, Section } from '../../../shared/components/layout';
import { Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { animateLayout } from '../../../shared/theme/motion';
import { portalProjectTone } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { DetailFrame, RecordState } from '../PortalFrame';
import { PortalFileList } from '../PortalFileList';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';
import { ProjectPlanPanel } from './ProjectPlanPanel';
import { ProjectProgressPanel } from './ProjectProgressPanel';
import { PortalTaskList, UpdateList } from './project-parts';

type Tab = 'overview' | 'progress' | 'tasks' | 'milestones' | 'updates' | 'files';

export interface PortalProjectLinks {
  /** A sign-off request; only passed for somebody who may open one. */
  onOpenSignOff?: (requestId: string) => void;
  onOpenRelease?: (releaseId: string) => void;
  onOpenTickets?: () => void;
}

/**
 * One project as the client sees it: client-visible work, published updates and shared files.
 *
 * The same six sections as the web page, as chips rather than tabs because six do not fit across
 * a phone. The progress board and the plan are each their own request, made only when their
 * section is opened.
 */
export function PortalProjectDetailScreen({
  projectId,
  ...links
}: { projectId: string } & PortalProjectLinks) {
  const queryClient = useQueryClient();
  const query = useResource<PortalProjectDetail>(
    portalKeys.project(projectId),
    `/portal/projects/${projectId}`,
  );
  if (!query.data) {
    return <RecordState query={query} loadingLabel="Loading the project" />;
  }
  return (
    <ProjectBody
      project={query.data}
      refreshing={query.isRefetching}
      // The project's key is the prefix of its progress and plan, so one pull refreshes all three.
      onRefresh={() =>
        void queryClient.invalidateQueries({ queryKey: portalKeys.project(projectId) })
      }
      links={links}
    />
  );
}

function ProjectBody({
  project,
  refreshing,
  onRefresh,
  links,
}: {
  project: PortalProjectDetail;
  refreshing: boolean;
  onRefresh: () => void;
  links: PortalProjectLinks;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const delivery = formatDate(project.targetDate);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'progress', label: 'Progress' },
    { key: 'tasks', label: `Work items · ${project.tasks.length}` },
    { key: 'milestones', label: `Milestones · ${project.milestones.length}` },
    { key: 'updates', label: `Updates · ${project.updates.length}` },
    { key: 'files', label: `Files · ${project.files.length}` },
  ];

  return (
    <DetailFrame refreshing={refreshing} onRefresh={onRefresh}>
      <Hero overline={project.code} title={project.name} icon="folder-open">
        <PillRow>
          <Pill
            label={PROJECT_STATUS_LABELS[project.status]}
            tone={portalProjectTone(project.status)}
          />
        </PillRow>
        <MetaLine icon="flag-outline">
          {project.progressPercent}% done{delivery ? ` · delivery ${delivery}` : ''}
        </MetaLine>
      </Hero>

      <ChipScroller>
        {tabs.map((item) => (
          <Chip
            key={item.key}
            role="tab"
            label={item.label}
            selected={tab === item.key}
            onPress={() => {
              animateLayout();
              setTab(item.key);
            }}
          />
        ))}
      </ChipScroller>

      {tab === 'overview' ? (
        <ProjectOverviewPanel
          project={project}
          {...(links.onOpenTickets ? { onOpenTickets: links.onOpenTickets } : {})}
        />
      ) : null}
      {tab === 'progress' ? (
        <ProjectProgressPanel
          projectId={project.id}
          {...(links.onOpenSignOff ? { onOpenSignOff: links.onOpenSignOff } : {})}
          {...(links.onOpenRelease ? { onOpenRelease: links.onOpenRelease } : {})}
        />
      ) : null}
      {tab === 'tasks' ? (
        <Section title="Work items" icon="list-outline" count={project.tasks.length}>
          <PortalTaskList
            tasks={project.tasks}
            emptyText="No work items shared for this project."
          />
        </Section>
      ) : null}
      {tab === 'milestones' ? (
        <ProjectPlanPanel projectId={project.id} milestones={project.milestones} />
      ) : null}
      {tab === 'updates' ? (
        <Section title="Published by your team" icon="newspaper-outline">
          <UpdateList
            updates={project.updates}
            emptyText="No updates yet. Completed work appears here once it is published."
          />
        </Section>
      ) : null}
      {tab === 'files' ? (
        <Section title="Files shared with you" icon="attach-outline" count={project.files.length}>
          <PortalFileList files={project.files} />
        </Section>
      ) : null}
    </DetailFrame>
  );
}
