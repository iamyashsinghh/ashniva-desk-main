import {
  PRIORITY,
  PRIORITY_LABELS,
  SUPPORT_TIER_LABELS,
  ALL_SUPPORT_TIERS,
  TICKET_TYPE,
  TICKET_TYPE_LABELS,
  type Priority,
  type ProductDetail,
  type SupportTier,
  type TicketType,
} from '@ashniva/types';
import { useMemo, useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Button, Divider, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useActiveProjects } from '../../support-queue/api';
import { SettingSwitch } from '../shared/SettingSwitch';
import { useUpdateProduct } from './api';
import { splitList } from './product-display';

const TIERS = ALL_SUPPORT_TIERS.map((tier) => ({ value: tier, label: SUPPORT_TIER_LABELS[tier] }));
const PRIORITIES = Object.values(PRIORITY).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
const TYPES = Object.values(TICKET_TYPE).map((value) => ({
  value,
  label: TICKET_TYPE_LABELS[value],
}));

/**
 * What a product's support does, and where its tickets go.
 *
 * The support project is the field that matters, and its hint says why: without one the ingress
 * has no team to route to and refuses every request. Everything else has a working default.
 */
export function ProductSettingsSheet({
  product,
  onClose,
  onSaved,
}: {
  product: ProductDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product.name,
    projectId: product.project?.id ?? null,
    supportTier: product.supportTier,
    defaultPriority: product.defaultPriority,
    defaultType: product.defaultType,
    allowedWorkAreas: product.allowedWorkAreas.join(', '),
    allowedOrigins: product.allowedOrigins.join(', '),
    isActive: product.isActive,
    supportEnabled: product.supportEnabled,
    autoRouteEnabled: product.autoRouteEnabled,
    ivrEnabled: product.ivrEnabled,
  });
  const projects = useActiveProjects(true);
  const save = useUpdateProduct(product.id, onSaved);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const projectOptions = useMemo(() => {
    const options = (projects.data ?? []).map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    }));
    // A product can be linked to a project that has since been closed; keep it choosable.
    const linked = product.project;
    if (linked && !options.some((option) => option.value === linked.id)) {
      options.unshift({ value: linked.id, label: `${linked.code} · ${linked.name}` });
    }
    return options;
  }, [projects.data, product.project]);

  const submit = () =>
    void save.run({
      name: form.name.trim(),
      projectId: form.projectId,
      supportTier: form.supportTier,
      defaultPriority: form.defaultPriority,
      defaultType: form.defaultType,
      allowedWorkAreas: splitList(form.allowedWorkAreas),
      allowedOrigins: splitList(form.allowedOrigins),
      isActive: form.isActive,
      supportEnabled: form.supportEnabled,
      autoRouteEnabled: form.autoRouteEnabled,
      ivrEnabled: form.ivrEnabled,
    });

  return (
    <Sheet
      visible
      title="Support settings"
      subtitle={product.code}
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save settings"
            icon="checkmark"
            loading={save.busy}
            disabled={form.name.trim().length < 2}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Name" required>
        <Input
          accessibilityLabel="Name"
          value={form.name}
          onChangeText={(name) => set('name', name)}
        />
      </Field>
      <SelectField
        label="Support project"
        icon="folder-outline"
        hint="Whose team answers for this product. Without one, support requests are refused."
        options={projectOptions}
        value={form.projectId ? [form.projectId] : []}
        onChange={(ids) => set('projectId', ids[0] ?? null)}
        allowClear
        clearLabel="Not linked"
        placeholder="Not linked"
        loading={projects.isLoading}
      />
      <SelectField
        label="Support tier"
        options={TIERS}
        value={[form.supportTier]}
        onChange={(ids) => ids[0] && set('supportTier', ids[0] as SupportTier)}
      />
      <SelectField
        label="Default priority"
        options={PRIORITIES}
        value={[form.defaultPriority]}
        onChange={(ids) => ids[0] && set('defaultPriority', ids[0] as Priority)}
      />
      <SelectField
        label="Default type"
        options={TYPES}
        value={[form.defaultType]}
        onChange={(ids) => ids[0] && set('defaultType', ids[0] as TicketType)}
      />
      <Field
        label="Allowed work areas"
        hint="Comma separated. Empty means the product may name any area."
      >
        <Input
          accessibilityLabel="Allowed work areas"
          value={form.allowedWorkAreas}
          onChangeText={(text) => set('allowedWorkAreas', text)}
        />
      </Field>
      <Field
        label="Widget origins"
        hint="Comma separated, e.g. https://app.example.com. Literal origins only — never a pattern. Empty means this product has no embedded widget."
      >
        <Input
          accessibilityLabel="Widget origins"
          value={form.allowedOrigins}
          onChangeText={(text) => set('allowedOrigins', text)}
          placeholder="https://app.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </Field>
      <Divider />
      <SettingSwitch
        label="Product is active"
        description="Off stops every credential for this product working at all."
        value={form.isActive}
        onChange={(value) => set('isActive', value)}
      />
      <SettingSwitch
        label="Accept support requests"
        description="Off refuses new tickets while leaving existing ones alone."
        value={form.supportEnabled}
        onChange={(value) => set('supportEnabled', value)}
      />
      <SettingSwitch
        label="Route tickets automatically"
        description="Off leaves each ticket in the support queue for somebody to assign."
        value={form.autoRouteEnabled}
        onChange={(value) => set('autoRouteEnabled', value)}
      />
      <SettingSwitch
        label="IVR support"
        description="Whether this product's tickets may raise support calls."
        value={form.ivrEnabled}
        onChange={(value) => set('ivrEnabled', value)}
      />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
