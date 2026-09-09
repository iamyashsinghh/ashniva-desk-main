import type { PortalProjectProgress, PortalTaskSummary } from '@ashniva/types';
import { Badge, Card, EmptyState, Kpi, KpiGrid } from '@ashniva/ui';
import { Link } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { ProgressBar } from '../../milestones/components/MilestoneTable';
import { UatStatusBadge } from '../../uat/pages/PortalUatPage';
import { usePortalProjectProgressQuery } from '../api';
import { PortalTaskRows } from './PortalTaskRows';

/** One column of the board: a card with its own empty line, so a quiet day still reads as news. */
function WorkCard({
  title,
  tasks,
  empty,
}: {
  title: string;
  tasks: PortalTaskSummary[];
  empty: string;
}) {
  return (
    <Card title={title} headerAddon={<span className="muted">{tasks.length}</span>}>
      {tasks.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <PortalTaskRows tasks={tasks} emptyTitle={empty} />
      )}
    </Card>
  );
}

/**
 * "What did the team do on my project today?"
 *
 * Everything on this panel is written for somebody who does not work in software: no internal
 * status names, no health indicator, no reason a task is held beyond what the team published for
 * this client to read.
 */
export function PortalProgressPanel({ projectId }: { projectId: string }) {
  const query = usePortalProjectProgressQuery(projectId, true);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      loadingLabel="Loading today’s progress"
    >
      {query.data ? <ProgressBody progress={query.data} /> : null}
    </QueryState>
  );
}

function ProgressBody({ progress }: { progress: PortalProjectProgress }) {
  const waitingOnYou = progress.blockers.filter((blocker) => blocker.waitingOnYou);

  return (
    <>
      <KpiGrid>
        <Kpi label="Overall progress" value={`${progress.progressPercent}%`} />
        <Kpi label="Finished today" value={progress.completedToday.length} />
        <Kpi label="Being built" value={progress.inProgress.length} />
        <Kpi label="Being tested" value={progress.underTesting.length} />
        <Kpi label="Waiting for you" value={waitingOnYou.length} />
        <Kpi label="Released recently" value={progress.recentReleases.length} />
      </KpiGrid>

      <div className="dashboard__grid dashboard__grid--equal">
        <Card title="Where the project is">
          {progress.currentMilestone ? (
            <>
              <p className="prose">
                <strong>{progress.currentMilestone.name}</strong>
                {progress.currentMilestone.dueDate
                  ? ` · due ${formatDate(progress.currentMilestone.dueDate)}`
                  : ''}
              </p>
              <ProgressBar
                percent={progress.currentMilestone.progressPercent}
                label={`Progress on ${progress.currentMilestone.name}`}
              />
              {progress.currentMilestone.description ? (
                <p className="prose muted">{progress.currentMilestone.description}</p>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No milestone shared yet"
              description="Your team will share the plan here once it is agreed."
            />
          )}
          <p className="update-list__meta">
            {progress.taskCounts.completed} of {progress.taskCounts.total} work items done · as of{' '}
            {formatDate(progress.asOfDate)}
          </p>
        </Card>

        <Card
          title="Needs attention"
          headerAddon={
            waitingOnYou.length > 0 ? (
              <Badge tone="warning">{waitingOnYou.length} for you</Badge>
            ) : null
          }
        >
          {progress.blockers.length === 0 ? (
            <EmptyState title="Nothing is held up" description="Every piece of work is moving." />
          ) : (
            <div className="update-list">
              {progress.blockers.map((blocker) => (
                <div key={blocker.id} className="update-list__item">
                  <span>
                    <strong>{blocker.title}</strong>{' '}
                    <Badge tone={blocker.waitingOnYou ? 'warning' : 'review'}>
                      {blocker.waitingOnYou ? 'Waiting for you' : 'On hold'}
                    </Badge>
                  </span>
                  <span>
                    {blocker.note ?? 'Your team is working on it and will update you here.'}
                  </span>
                  <span className="update-list__meta">
                    {blocker.key} · since {formatRelative(blocker.since)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <WorkCard
        title="Finished today"
        tasks={progress.completedToday}
        empty="No work was completed today"
      />
      <div className="dashboard__grid dashboard__grid--equal">
        <WorkCard
          title="Being built"
          tasks={progress.inProgress}
          empty="Nothing is being built right now"
        />
        <WorkCard
          title="Being tested"
          tasks={progress.underTesting}
          empty="Nothing is in testing right now"
        />
      </div>
      <div className="dashboard__grid dashboard__grid--equal">
        <WorkCard
          title="Ready to go live"
          tasks={progress.readyToRelease}
          empty="Nothing is queued for release"
        />
        <WorkCard title="Coming up next" tasks={progress.upcoming} empty="Nothing is queued yet" />
      </div>

      <div className="dashboard__grid dashboard__grid--equal">
        <Card title="Your sign-offs" headerAddon={<Link to="/portal/uat">See all</Link>}>
          {progress.uatRequests.length === 0 ? (
            <EmptyState
              title="Nothing to sign off"
              description="When a change is ready for your approval it appears here."
            />
          ) : (
            <div className="update-list">
              {progress.uatRequests.map((uat) => (
                <div key={uat.id} className="update-list__item">
                  <span>
                    <Link to={`/portal/uat/${uat.id}`}>{uat.summaryPlain}</Link>{' '}
                    <UatStatusBadge status={uat.status} />
                  </span>
                  <span className="update-list__meta">
                    asked {formatRelative(uat.createdAt)}
                    {uat.decidedAt ? ` · answered ${formatRelative(uat.decidedAt)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Recently released"
          headerAddon={<Link to="/portal/release-notes">See all</Link>}
        >
          {progress.recentReleases.length === 0 ? (
            <EmptyState
              title="Nothing released yet"
              description="Each release your team publishes will be listed here."
            />
          ) : (
            <div className="update-list">
              {progress.recentReleases.map((release) => (
                <div key={release.id} className="update-list__item">
                  <span>
                    <strong>{release.version}</strong>
                  </span>
                  {release.summary ? <span>{release.summary}</span> : null}
                  <span className="update-list__meta">
                    released {formatDate(release.releaseDate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Latest updates from your team">
        {progress.recentUpdates.length === 0 ? (
          <EmptyState
            title="No updates yet"
            description="Completed work appears here once your team publishes it."
          />
        ) : (
          <div className="update-list">
            {progress.recentUpdates.map((update) => (
              <div key={update.id} className="update-list__item">
                <span>
                  <strong>{update.title}</strong>
                </span>
                <span>{update.body}</span>
                <span className="update-list__meta">{formatDate(update.workDate)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
