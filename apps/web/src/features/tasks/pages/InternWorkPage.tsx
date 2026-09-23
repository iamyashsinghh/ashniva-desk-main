import { PERMISSIONS, ROLE_KEYS, isManagerRole } from '@ashniva/types';
import { Button, EmptyState, PageHeader } from '@ashniva/ui';
import { Link, useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission, useSession } from '../../auth/session-context';
import { useTasksQuery } from '../api';
import { TaskTable } from '../components/TaskTable';

import '../tasks.css';
import './intern-work.css';

/**
 * Learning assignments for interns: a dedicated board for directors, PMs and team leads to
 * hand out work, and for interns to open, reply and attach files.
 */
export function InternWorkPage() {
  const navigate = useNavigate();
  const session = useSession();
  const canAssign = usePermission(PERMISSIONS.TASK_ASSIGN);
  const isIntern = session.user?.roleKey === ROLE_KEYS.INTERN;
  const mayAssign = Boolean(session.user && isManagerRole(session.user.roleKey) && canAssign);
  const tasks = useTasksQuery({ view: 'intern', limit: 100 });

  return (
    <div className="intern-work">
      <PageHeader
        title="Intern work"
        subtitle={
          isIntern
            ? 'Work assigned to you. Open a task to reply in comments and upload attachments with a short note on what each file is for.'
            : 'Assign learning work to interns. Only the person who assigns it, the intern, and Super Admin can see each assignment.'
        }
        actions={
          mayAssign ? (
            <Button variant="primary" onClick={() => void navigate('/intern-work/new')}>
              + Assign work
            </Button>
          ) : undefined
        }
      />
      <QueryState
        isLoading={tasks.isLoading}
        isError={tasks.isError}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
      >
        {(tasks.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={isIntern ? 'No intern work yet' : 'No assignments yet'}
            description={
              isIntern
                ? 'When a director, project manager or team lead assigns you work, it will appear here.'
                : 'Assign clear, time-boxed learning work. The intern replies and attaches files on the task.'
            }
            action={
              mayAssign ? (
                <Button variant="primary" onClick={() => void navigate('/intern-work/new')}>
                  Assign work
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="intern-work__list">
            <TaskTable tasks={tasks.data?.items ?? []} />
            <p className="intern-work__hint muted">
              Open a task to use comments and attachments. Attachments can include a short note
              describing what the file is for.
            </p>
          </div>
        )}
      </QueryState>
      {!isIntern && !mayAssign ? (
        <p className="muted">
          <Link to="/tasks">Back to tasks</Link>
        </p>
      ) : null}
    </div>
  );
}
