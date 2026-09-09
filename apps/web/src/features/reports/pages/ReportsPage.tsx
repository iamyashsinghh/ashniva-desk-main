import { PERMISSIONS, type DailyReportResponse } from '@ashniva/types';
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Kpi,
  KpiGrid,
  PageHeader,
  SegmentedControl,
  Toolbar,
} from '@ashniva/ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { CardsSkeleton } from '../../../shared/components/LoadingSkeletons';
import { QueryState } from '../../../shared/components/QueryState';
import { TaskStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatMinutes, todayIso } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { useDailyReportQuery, useReportHistoryQuery, useTeamReportsQuery } from '../api';

import '../../dashboard/dashboard.css';

type Mode = 'mine' | 'team' | 'history';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily reports: generated from the day's work logs and completions — nothing to fill in. */
export function ReportsPage() {
  const canSeeTeam = usePermission(PERMISSIONS.REPORT_READ_TEAM);
  const [mode, setMode] = useState<Mode>('mine');
  const [date, setDate] = useState(todayIso());
  const [userId, setUserId] = useState('');
  const mine = useDailyReportQuery(date, userId || undefined);
  const team = useTeamReportsQuery(date, mode === 'team' && canSeeTeam);
  const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 13 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const history = useReportHistoryQuery(from, date, userId || undefined);

  return (
    <div className="dashboard">
      <PageHeader
        title="Daily reports"
        subtitle="Generated automatically from work logs and completions · snapshot stored at 18:30 IST · live until then. Nothing to fill in."
      >
        <SegmentedControl
          aria-label="Report"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { key: 'mine', label: canSeeTeam ? 'One person' : 'My report' },
            ...(canSeeTeam ? [{ key: 'team' as const, label: 'Team' }] : []),
            { key: 'history', label: 'Last 14 days' },
          ]}
        />
        <Toolbar aria-label="Report filters">
          <Input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {canSeeTeam && mode !== 'team' ? (
            <PeoplePicker value={userId} onChange={setUserId} placeholder="Me" />
          ) : null}
        </Toolbar>
      </PageHeader>

      {mode === 'mine' ? (
        <QueryState
          isLoading={mine.isLoading}
          isError={mine.isError}
          error={mine.error}
          onRetry={() => void mine.refetch()}
          loadingFallback={<CardsSkeleton label="reports" cards={2} lines={6} />}
        >
          {mine.data ? <ReportCard report={mine.data} /> : null}
        </QueryState>
      ) : null}
      {mode === 'team' ? (
        <QueryState
          isLoading={team.isLoading}
          isError={team.isError}
          error={team.error}
          onRetry={() => void team.refetch()}
          loadingFallback={<CardsSkeleton label="reports" cards={2} lines={6} />}
        >
          {team.data && team.data.length > 0 ? (
            team.data.map((report) => <ReportCard key={report.userId} report={report} />)
          ) : (
            <EmptyState title="No activity recorded for this day" />
          )}
        </QueryState>
      ) : null}
      {mode === 'history' ? (
        <QueryState
          isLoading={history.isLoading}
          isError={history.isError}
          error={history.error}
          onRetry={() => void history.refetch()}
          loadingFallback={<CardsSkeleton label="reports" cards={2} lines={6} />}
        >
          {history.data && history.data.length > 0 ? (
            history.data.map((report) => (
              <ReportCard key={`${report.userId}-${report.reportDate}`} report={report} compact />
            ))
          ) : (
            <EmptyState
              title="No stored reports in this range"
              description="Snapshots are stored when work is submitted, approved or logged, and every evening."
            />
          )}
        </QueryState>
      ) : null}
    </div>
  );
}

function ReportCard({
  report,
  compact = false,
}: {
  report: DailyReportResponse;
  compact?: boolean;
}) {
  const { snapshot } = report;
  return (
    <Card
      title={`${report.userName} · ${formatDate(report.reportDate)}`}
      headerAddon={<span className="muted">{formatMinutes(snapshot.minutesLogged)} logged</span>}
    >
      {!compact ? (
        <KpiGrid>
          <Kpi label="Worked on" value={snapshot.tasksWorkedOn} />
          <Kpi label="Submitted for review" value={snapshot.tasksSubmitted} />
          <Kpi label="Completed" value={snapshot.tasksCompleted} />
          <Kpi label="Time spent" value={formatMinutes(snapshot.minutesLogged)} />
        </KpiGrid>
      ) : null}
      {snapshot.items.length === 0 ? (
        <EmptyState title="No activity that day" />
      ) : (
        <div className="update-list" style={{ marginTop: compact ? 0 : 12 }}>
          {snapshot.items.map((item) => (
            <div key={item.taskId} className="update-list__item">
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link to={`/tasks/${item.taskId}`}>{item.taskKey}</Link>
                <span>{item.title}</span>
                <TaskStatusPill status={item.status} />
                {item.completedToday ? <Badge tone="success">Completed</Badge> : null}
                {item.submittedForReviewToday ? <Badge tone="warning">Submitted</Badge> : null}
                {item.clientVisible ? <Badge tone="success">Client</Badge> : null}
              </span>
              <span className="update-list__meta">
                {item.projectName} · {formatMinutes(item.minutes)}
                {item.summaries.length > 0 ? ` · ${item.summaries.join(' · ')}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
