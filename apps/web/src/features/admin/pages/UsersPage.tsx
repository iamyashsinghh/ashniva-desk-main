import { ROLE_LABELS, type UserSummary } from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatRelative } from '../../../shared/lib/format';
import { useReauth } from '../../auth/reauth';
import { useCurrentUser } from '../../auth/session-context';
import {
  useOrganizationsQuery,
  useTeamsQuery,
  useUserMutations,
  useUsersQuery,
} from '../../users/api';
import { TeamsPanel } from '../components/TeamsPanel';
import { UserFormModal } from '../components/UserFormModal';
import { ChangeRoleModal, InvitationLinkModal } from '../components/UserRoleModals';

import '../../dashboard/dashboard.css';

/** Users & teams: people of a company (with role, title, teams) and the teams panel. */
export function UsersPage() {
  const me = useCurrentUser();
  const isInternal = me.organization.isServiceProvider;
  const [organizationId, setOrganizationId] = useState(me.organization.id);
  const [editing, setEditing] = useState<UserSummary | 'new' | null>(null);
  const [changingRole, setChangingRole] = useState<UserSummary | null>(null);
  const [invitation, setInvitation] = useState<{
    name: string;
    link: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | undefined>();
  // A client admin also reaches this screen; the company switcher is the provider's, so the
  // picker is only fetched for internal staff.
  const organizations = useOrganizationsQuery(isInternal);
  const users = useUsersQuery(organizationId);
  const teams = useTeamsQuery();
  const { setStatus, invite } = useUserMutations();
  // A fresh invitation link is a fresh credential for that account, so the API asks for the
  // password again before it mints one.
  const reauth = useReauth();

  const columns: TableColumn<UserSummary>[] = [
    {
      key: 'person',
      header: 'Person',
      render: (user) => (
        <div className="task-cell">
          <span className="task-cell__title">
            {user.name}
            {user.status !== 'ACTIVE' ? (
              <Badge tone="danger">{user.status.toLowerCase()}</Badge>
            ) : null}
          </span>
          <span className="muted">{user.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '190px',
      render: (user) => user.roleName || ROLE_LABELS[user.roleKey],
    },
    {
      key: 'title',
      header: 'Title',
      width: '150px',
      hideOnMobile: true,
      render: (user) => user.title ?? '—',
    },
    {
      key: 'teams',
      header: 'Teams',
      hideOnMobile: true,
      render: (user) =>
        user.teams.length ? (
          user.teams.map((team) => team.name).join(', ')
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'seen',
      header: 'Last sign-in',
      width: '110px',
      hideOnMobile: true,
      render: (user) => (
        <span className="muted">
          {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '300px',
      align: 'right',
      render: (user) => (
        <span
          style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}
        >
          <Button size="sm" onClick={() => setEditing(user)}>
            Edit
          </Button>
          <Button
            size="sm"
            disabled={user.id === me.id}
            disabledReason="You cannot change your own role"
            onClick={() => setChangingRole(user)}
          >
            Change role
          </Button>
          {user.lastLoginAt === null ? (
            <Button
              size="sm"
              variant="ghost"
              loading={invite.isPending}
              onClick={() =>
                void reauth
                  .request()
                  .then((token) =>
                    invite.mutateAsync({
                      id: user.id,
                      organizationId,
                      headers: reauth.headers(token),
                    }),
                  )
                  .then((result) => setInvitation({ name: user.name, ...result }))
                  .catch((cause) => setError(errorMessage(cause)))
              }
            >
              Invite link
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={user.status === 'ACTIVE' ? 'ghost' : 'secondary'}
            disabled={user.id === me.id}
            disabledReason="You cannot deactivate yourself"
            loading={setStatus.isPending}
            onClick={() =>
              void setStatus
                .mutateAsync({
                  id: user.id,
                  status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                  organizationId,
                })
                .catch((cause) => setError(errorMessage(cause)))
            }
          >
            {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="dashboard">
      <PageHeader
        title="Users & teams"
        subtitle={users.data ? `${users.data.length} people` : undefined}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Add person
          </Button>
        }
      >
        {isInternal ? (
          <Select
            aria-label="Company"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            options={(organizations.data ?? []).map((organization) => ({
              value: organization.id,
              label: organization.name,
            }))}
          />
        ) : null}
      </PageHeader>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <QueryState
        isLoading={users.isLoading}
        isError={users.isError}
        error={users.error}
        onRetry={() => void users.refetch()}
      >
        {users.data ? (
          <Table
            aria-label="People"
            columns={columns}
            rows={users.data}
            rowKey={(user) => user.id}
            empty={<EmptyState title="No people in this company yet" />}
          />
        ) : null}
      </QueryState>
      {isInternal && organizationId === me.organization.id ? (
        <Card
          title="Teams"
          headerAddon={<span className="muted">team membership drives "Team tasks"</span>}
        >
          <TeamsPanel teams={teams.data ?? []} people={users.data ?? []} />
        </Card>
      ) : null}
      {editing ? (
        <UserFormModal
          organizationId={organizationId}
          user={editing === 'new' ? undefined : editing}
          teams={teams.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {changingRole ? (
        <ChangeRoleModal
          user={changingRole}
          organizationId={organizationId}
          onClose={() => setChangingRole(null)}
        />
      ) : null}
      {invitation ? (
        <InvitationLinkModal
          name={invitation.name}
          invitation={invitation}
          onClose={() => setInvitation(null)}
        />
      ) : null}
      {reauth.modal}
    </div>
  );
}
