import {
  ALL_ROLE_KEYS,
  ROLE_LABELS,
  isClientRole,
  type CustomRoleDetail,
  type PermissionCatalogEntry,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Textarea,
  Tooltip,
} from '@ashniva/ui';
import { useMemo, useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReauth } from '../../auth/reauth';
import { useRoleMutations } from '../roles-api';

interface RoleEditorModalProps {
  organizationId: string;
  /** Template roles: system roles the editor starts from (permissions are copied). */
  systemRoles: CustomRoleDetail[];
  catalog: PermissionCatalogEntry[];
  role?: CustomRoleDetail;
  onClose: () => void;
}

/**
 * Create or edit a custom role: pick a template, then tick permissions per module. The API
 * enforces the real rules (no escalation above the caller, client roles only client-safe keys).
 */
export function RoleEditorModal({
  organizationId,
  systemRoles,
  catalog,
  role,
  onClose,
}: RoleEditorModalProps) {
  const { create, update } = useRoleMutations(role?.id);
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [templateKey, setTemplateKey] = useState<RoleKey>(role?.templateKey ?? 'DEVELOPER');
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(
    () =>
      new Set(
        role?.permissions ??
          systemRoles.find((entry) => entry.key === 'DEVELOPER')?.permissions ??
          [],
      ),
  );
  const clientTemplate = isClientRole(templateKey);
  const modules = useMemo(() => {
    const grouped = new Map<string, PermissionCatalogEntry[]>();
    for (const entry of catalog) {
      if (clientTemplate && !entry.clientAllowed) {
        continue;
      }
      grouped.set(entry.module, [...(grouped.get(entry.module) ?? []), entry]);
    }
    return [...grouped.entries()];
  }, [catalog, clientTemplate]);

  const applyTemplate = (key: RoleKey) => {
    setTemplateKey(key);
    setPermissions(new Set(systemRoles.find((entry) => entry.key === key)?.permissions ?? []));
  };
  const toggle = (key: PermissionKey) =>
    setPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  const save = async () => {
    const token = await reauth.request();
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: [...permissions],
      headers: reauth.headers(token),
    };
    if (role) {
      await update.mutateAsync(body);
    } else {
      await create.mutateAsync({ ...body, templateKey, organizationId });
    }
  };

  return (
    <>
      <Modal
        open
        size="lg"
        title={role ? `Edit role “${role.name}”` : 'New custom role'}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending || update.isPending}
              disabled={name.trim().length < 2}
              disabledReason="Give the role a name"
              onClick={() => void wrap(save)()}
            >
              {role ? 'Save role' : 'Create role'}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField
            label="Start from"
            hint={role ? 'Fixed once created' : 'Copies that role’s permissions'}
          >
            <Select
              value={templateKey}
              disabled={Boolean(role)}
              onChange={(event) => applyTemplate(event.target.value as RoleKey)}
              options={ALL_ROLE_KEYS.map((key) => ({ value: key, label: ROLE_LABELS[key] }))}
            />
          </FormField>
          <FormGridFull>
            <FormField label="Description">
              <Textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
          </FormGridFull>
        </FormGrid>
        <p className="muted" style={{ margin: '12px 0 6px' }}>
          {permissions.size} permissions · you will be asked for your password when saving
        </p>
        <div className="dashboard__grid dashboard__grid--equal">
          {modules.map(([module, entries]) => (
            <fieldset key={module} className="permission-group">
              <legend>{module}</legend>
              {entries.map((entry) => (
                <label key={entry.key} className="permission-group__row">
                  {/*
                    The permission key is what the API and the audit log call this, and the row
                    shows the sentence instead. On the checkbox rather than the label, because the
                    checkbox is the thing a keyboard reaches — a `title` on the label was visible
                    to a mouse and to nothing else.
                  */}
                  <Tooltip content={entry.key}>
                    <input
                      type="checkbox"
                      checked={permissions.has(entry.key)}
                      onChange={() => toggle(entry.key)}
                    />
                  </Tooltip>
                  <span>{entry.description}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}
