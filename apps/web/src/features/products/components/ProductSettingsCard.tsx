import {
  PRIORITY,
  PRIORITY_LABELS,
  SUPPORT_TIER,
  SUPPORT_TIER_LABELS,
  TICKET_TYPE,
  TICKET_TYPE_LABELS,
  type Priority,
  type ProductDetail,
  type SupportTier,
  type TicketType,
} from '@ashniva/types';
import {
  Alert,
  Button,
  Card,
  FormActions,
  FormField,
  FormGrid,
  Input,
  Select,
  Switch,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useProjectsQuery } from '../../projects/api';
import type { ProductInput } from '../api';

export interface ProductSettingsCardProps {
  product: ProductDetail;
  canManage: boolean;
  onSave: (input: ProductInput) => Promise<unknown>;
}

const TIERS = Object.values(SUPPORT_TIER).map((tier) => ({
  value: tier,
  label: SUPPORT_TIER_LABELS[tier],
}));
const PRIORITIES = Object.values(PRIORITY).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}));
const TYPES = Object.values(TICKET_TYPE).map((type) => ({
  value: type,
  label: TICKET_TYPE_LABELS[type],
}));

/**
 * What a product's support does, and where its tickets go.
 *
 * The project link is the important field on this form, and the hint says why: without it the
 * ingress has no team to route to and refuses every request. Everything else has a working
 * default; this one does not.
 */
export function ProductSettingsCard({ product, canManage, onSave }: ProductSettingsCardProps) {
  const projects = useProjectsQuery({ status: 'ACTIVE' }, canManage);
  const [form, setForm] = useState({
    name: product.name,
    projectId: product.project?.id ?? '',
    isActive: product.isActive,
    supportEnabled: product.supportEnabled,
    autoRouteEnabled: product.autoRouteEnabled,
    ivrEnabled: product.ivrEnabled,
    supportTier: product.supportTier,
    defaultPriority: product.defaultPriority,
    defaultType: product.defaultType,
    allowedWorkAreas: product.allowedWorkAreas.join(', '),
    allowedOrigins: product.allowedOrigins.join(', '),
  });
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    setError(undefined);
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        projectId: form.projectId || null,
        isActive: form.isActive,
        supportEnabled: form.supportEnabled,
        autoRouteEnabled: form.autoRouteEnabled,
        ivrEnabled: form.ivrEnabled,
        supportTier: form.supportTier as SupportTier,
        defaultPriority: form.defaultPriority as Priority,
        defaultType: form.defaultType as TicketType,
        allowedWorkAreas: form.allowedWorkAreas
          .split(',')
          .map((area) => area.trim())
          .filter(Boolean),
        allowedOrigins: form.allowedOrigins
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Support settings" headerAddon={<code>{product.code}</code>}>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <FormGrid>
        <FormField label="Name">
          <Input
            value={form.name}
            disabled={!canManage}
            onChange={(event) => set('name', event.target.value)}
          />
        </FormField>
        <FormField
          label="Support project"
          hint="Whose team answers for this product. Without one, support requests are refused."
        >
          <Select
            options={(projects.data ?? []).map((project) => ({
              value: project.id,
              label: `${project.code} · ${project.name}`,
            }))}
            placeholder="Not linked"
            value={form.projectId}
            disabled={!canManage}
            onChange={(event) => set('projectId', event.target.value)}
          />
        </FormField>
        <FormField label="Support tier">
          <Select
            options={TIERS}
            value={form.supportTier}
            disabled={!canManage}
            onChange={(event) => set('supportTier', event.target.value as SupportTier)}
          />
        </FormField>
        <FormField label="Default priority">
          <Select
            options={PRIORITIES}
            value={form.defaultPriority}
            disabled={!canManage}
            onChange={(event) => set('defaultPriority', event.target.value as Priority)}
          />
        </FormField>
        <FormField label="Default type">
          <Select
            options={TYPES}
            value={form.defaultType}
            disabled={!canManage}
            onChange={(event) => set('defaultType', event.target.value as TicketType)}
          />
        </FormField>
        <FormField
          label="Allowed work areas"
          hint="Comma separated. Empty means the product may name any area."
        >
          <Input
            value={form.allowedWorkAreas}
            disabled={!canManage}
            onChange={(event) => set('allowedWorkAreas', event.target.value)}
          />
        </FormField>
        <FormField
          label="Widget origins"
          hint="Comma separated, e.g. https://app.example.com. Literal origins only — never a pattern. Empty means this product has no embedded widget."
        >
          <Input
            value={form.allowedOrigins}
            placeholder="https://app.example.com"
            disabled={!canManage}
            onChange={(event) => set('allowedOrigins', event.target.value)}
          />
        </FormField>
      </FormGrid>

      <div className="product-switches">
        <Switch
          checked={form.isActive}
          disabled={!canManage}
          onChange={(value) => set('isActive', value)}
          label="Product is active"
          description="Off stops every credential for this product working at all."
        />
        <Switch
          checked={form.supportEnabled}
          disabled={!canManage}
          onChange={(value) => set('supportEnabled', value)}
          label="Accept support requests"
          description="Off refuses new tickets while leaving existing ones alone."
        />
        <Switch
          checked={form.autoRouteEnabled}
          disabled={!canManage}
          onChange={(value) => set('autoRouteEnabled', value)}
          label="Route tickets automatically"
          description="Off leaves each ticket in the support queue for somebody to assign."
        />
        <Switch
          checked={form.ivrEnabled}
          disabled={!canManage}
          onChange={(value) => set('ivrEnabled', value)}
          label="IVR support"
          description="Configuration only for now — telephony arrives with package 9."
        />
      </div>

      {canManage ? (
        <div className="stack-top">
          <FormActions>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              Save settings
            </Button>
          </FormActions>
        </div>
      ) : null}
    </Card>
  );
}
