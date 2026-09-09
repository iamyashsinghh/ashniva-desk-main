import { PERMISSIONS, type CustomRoleDetail } from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormActions,
  Modal,
  PageHeader,
  Select,
} from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { formatDateTime } from '../../../shared/lib/format';
import { useReauth } from '../../auth/reauth';
import { useCurrentUser, usePermission } from '../../auth/session-context';
import { useOrganizationsQuery } from '../../users/api';
import { RoleEditorModal } from '../components/RoleEditorModal';
import {
  useCustomRolesQuery,
  usePermissionCatalogQuery,
  useRoleHistoryQuery,
  useRoleMutations,
} from '../roles-api';

import '../../dashboard/dashboard.css';
import '../roles.css';

/** Roles & permissions: system roles (read-only) and the organization's editable custom roles. */
export function RolesPage() {
  const me = useCurrentUser();
  const canManage = usePermission(PERMISSIONS.ROLE_MANAGE);
  const [organizationId, setOrganizationId] = useState(me.organization.id);
  const [editing, setEditing] = useState<CustomRoleDetail | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CustomRoleDetail | null>(null);
  const [historyOf, setHistoryOf] = useState<CustomRoleDetail | null>(null);
  const roles = useCustomRolesQuery(organizationId);
  const catalog = usePermissionCatalogQuery();
  const organizations = useOrganizationsQuery(me.organization.isServiceProvider);
  const systemRoles = (roles.data ?? []).filter((role) => role.isSystem);
  const customRoles = (roles.data ?? []).filter((role) => !role.isSystem);

  return (
    <div className="dashboard">
      <PageHeader
        title="Roles & permissions"
        subtitle="System roles are fixed. Custom roles start from a template and can never exceed your own permissions; every change is audited and needs your password."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              New custom role
            </Button>
          ) : undefined
        }
      >
        {me.organization.isServiceProvider ? (
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
      <QueryState
        isLoading={roles.isLoading}
        isError={roles.isError}
        error={roles.error}
        onRetry={() => void roles.refetch()}
      >
        <>
          <h2 className="dashboard__section-title">Custom roles</h2>
          {customRoles.length === 0 ? (
            <EmptyState
              title="No custom roles yet"
              description="Create one to give a person a narrower set of permissions than any system role."
            />
          ) : (
            <div className="dashboard__grid dashboard__grid--equal">
              {customRoles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  canManage={canManage}
                  onEdit={() => setEditing(role)}
                  onDelete={() => setDeleting(role)}
                  onHistory={() => setHistoryOf(role)}
                />
              ))}
            </div>
          )}
          <h2 className="dashboard__section-title">System roles</h2>
          <div className="dashboard__grid dashboard__grid--equal">
            {systemRoles.map((role) => (
              <RoleCard key={role.id} role={role} canManage={false} />
            ))}
          </div>
        </>
      </QueryState>
      {editing && catalog.data ? (
        <RoleEditorModal
          organizationId={organizationId}
          systemRoles={systemRoles}
          catalog={catalog.data}
          role={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeleteRoleModal role={deleting} onClose={() => setDeleting(null)} /> : null}
      {historyOf ? <RoleHistoryModal role={historyOf} onClose={() => setHistoryOf(null)} /> : null}
    </div>
  );
}

interface RoleCardProps {
  role: CustomRoleDetail;
  canManage: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onHistory?: () => void;
}

function RoleCard({ role, canManage, onEdit, onDelete, onHistory }: RoleCardProps) {
  return (
    <Card
      title={role.name}
      headerAddon={
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {role.isSystem ? <Badge tone="info">System</Badge> : <Badge tone="neutral">Custom</Badge>}
          {role.audience === 'CLIENT' ? <Badge tone="review">Client</Badge> : null}
          <span className="muted">{role.memberCount} people</span>
        </span>
      }
    >
      {role.description ? (
        <p className="muted" style={{ marginBottom: 8 }}>
          {role.description}
        </p>
      ) : null}
      <p className="muted">{role.permissions.length} permissions</p>
      <ul className="permission-list">
        {role.permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
      </ul>
      {canManage && !role.isSystem ? (
        <div className="stack-top">
          <FormActions>
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={onHistory}>
              History
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={role.memberCount > 0}
              disabledReason="Move the people to another role first"
              onClick={onDelete}
            >
              Delete
            </Button>
          </FormActions>
        </div>
      ) : null}
    </Card>
  );
}

function DeleteRoleModal({ role, onClose }: { role: CustomRoleDetail; onClose: () => void }) {
  const { remove } = useRoleMutations(role.id);
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const run = async () => {
    const token = await reauth.request();
    await remove.mutateAsync({ headers: reauth.headers(token) });
  };
  return (
    <>
      <Modal
        open
        title={`Delete “${role.name}”?`}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Keep it</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => void wrap(run)()}>
              Delete role
            </Button>
          </>
        }
      >
        <p className="prose">The role is removed for good. You will be asked for your password.</p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}

function RoleHistoryModal({ role, onClose }: { role: CustomRoleDetail; onClose: () => void }) {
  const history = useRoleHistoryQuery(role.id);
  return (
    <Modal
      open
      size="lg"
      title={`History of “${role.name}”`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <QueryState
        isLoading={history.isLoading}
        isError={history.isError}
        error={history.error}
        onRetry={() => void history.refetch()}
      >
        {history.data && history.data.length > 0 ? (
          <ul className="timeline">
            {history.data.map((entry) => (
              <li key={entry.id} className="timeline__item">
                <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
                <span>
                  {entry.action}
                  <span className="timeline__note"> · {entry.actor?.name ?? 'system'}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No changes recorded yet" />
        )}
      </QueryState>
    </Modal>
  );
}
