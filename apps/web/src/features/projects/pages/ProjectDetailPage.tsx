import {
  PERMISSIONS,
  PROJECT_MEMBER_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectDetail,
} from '@ashniva/types';
import { Button, Card, EmptyState, PageHeader, Tabs } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { projectAnchor } from '../../communication/conversation-anchors';
import { ConversationPanel } from '../../communication/components/ConversationPanel';
import { useClientUpdatesQuery } from '../../client-updates/api';
import { useTasksQuery } from '../../tasks/api';
import { TaskTable } from '../../tasks/components/TaskTable';
import { useTicketsQuery } from '../../tickets/api';
import { TicketTable } from '../../tickets/components/TicketTable';
import { useProjectQuery } from '../api';
import { ProjectMembersModal } from '../components/ProjectMembersModal';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { ProjectOverviewPanel } from '../components/ProjectOverviewPanel';
import { ProjectPlanPanel } from '../components/ProjectPlanPanel';
import { ProjectUpdatesPanel } from '../components/ProjectUpdatesPanel';

import '../../tasks/tasks.css';

type Tab = 'overview' | 'plan' | 'tasks' | 'tickets' | 'updates' | 'members';

/** Project detail: overview, the plan, tasks, tickets, client updates and members. */
export function ProjectDetailPage() {
  const { id } = useParams();
  const query = useProjectQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <ProjectBody project={query.data} /> : null}
    </QueryState>
  );
}

function ProjectBody({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as Tab;
  const canManage = usePermission(PERMISSIONS.PROJECT_MANAGE);
  // The permission is not the gate — the server checks project membership on every request. This
  // only decides whether to render a panel that would refuse them anyway.
  const canChat = usePermission(PERMISSIONS.CONVERSATION_PARTICIPATE);
  const canCreateTask = usePermission(PERMISSIONS.TASK_CREATE);
  const [editing, setEditing] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const tasks = useTasksQuery({ view: 'all', projectId: project.id }, tab === 'tasks');
  const tickets = useTicketsQuery({ view: 'all', projectId: project.id });
  const updates = useClientUpdatesQuery({ projectId: project.id });

  return (
    <div className="task-detail">
      <PageHeader
        crumbs={
          <>
            <Link to="/projects">Projects</Link> / {project.code}
          </>
        }
        title={project.name}
        subtitle={`${project.clientOrganization?.name ?? 'Internal'} · ${PROJECT_TYPE_LABELS[project.type]} · ${PROJECT_STATUS_LABELS[project.status]}`}
        actions={
          <>
            {canCreateTask ? (
              <Button onClick={() => void navigate(`/tasks/new?projectId=${project.id}`)}>
                + Task
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </>
        }
      >
        <Tabs
          aria-label="Project sections"
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          items={[
            { key: 'overview', label: 'Overview' },
            { key: 'plan', label: 'Plan' },
            { key: 'tasks', label: 'Tasks', count: project.taskCounts.total },
            { key: 'tickets', label: 'Tickets', count: project.openTicketCount },
            { key: 'updates', label: 'Client updates' },
            { key: 'members', label: 'Members', count: project.members.length },
          ]}
        />
      </PageHeader>

      {tab === 'overview' ? (
        <>
          <ProjectOverviewPanel project={project} />
          {canChat ? (
            <ConversationPanel anchor={projectAnchor(project.id)} title="Project chat" />
          ) : null}
        </>
      ) : null}
      {/* Its own query, made only while this tab is open. */}
      {tab === 'plan' ? <ProjectPlanPanel projectId={project.id} /> : null}
      {tab === 'tasks' ? (
        <QueryState isLoading={tasks.isLoading} isError={tasks.isError} error={tasks.error}>
          {tasks.data ? (
            <TaskTable
              tasks={tasks.data.items}
              showProject={false}
              emptyTitle="No tasks in this project yet"
            />
          ) : null}
        </QueryState>
      ) : null}
      {tab === 'tickets' ? (
        <QueryState isLoading={tickets.isLoading} isError={tickets.isError} error={tickets.error}>
          {tickets.data ? (
            <TicketTable tickets={tickets.data.items} emptyTitle="No tickets for this project" />
          ) : null}
        </QueryState>
      ) : null}
      {tab === 'updates' ? <ProjectUpdatesPanel updates={updates.data ?? []} /> : null}
      {tab === 'members' ? (
        <Card
          title="Members"
          headerAddon={
            canManage ? <Button onClick={() => setEditingTeam(true)}>Edit team</Button> : undefined
          }
        >
          {project.members.length === 0 ? (
            <EmptyState title="No members yet" />
          ) : (
            <dl className="kv">
              {project.members.map((member) => (
                <div key={member.id} style={{ display: 'contents' }}>
                  <dt>{PROJECT_MEMBER_ROLE_LABELS[member.role]}</dt>
                  <dd>
                    {member.name} <span className="muted">· {member.email}</span>
                    {member.responsibilities.length > 0 ? (
                      <div className="muted">{member.responsibilities.join(' · ')}</div>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      ) : null}
      {editingTeam ? (
        <ProjectMembersModal
          projectId={project.id}
          members={project.members}
          onClose={() => setEditingTeam(false)}
        />
      ) : null}
      {editing ? (
        <ProjectFormModal
          open
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
