import type { ProductDetail } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useActiveProjects } from '../../support-queue/api';
import { useCreateProduct } from './api';

/**
 * Registering a product: only what decides whether it can work at all, as on the web. Everything
 * else has a working default and is edited on the product's own screen, which opens next.
 */
export function NewProductSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (product: ProductDetail) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const projects = useActiveProjects(true);
  const create = useCreateProduct(onCreated);
  const ready = code.trim().length >= 2 && name.trim().length >= 2;

  const options = useMemo(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
        icon: 'folder-open-outline' as const,
      })),
    [projects.data],
  );

  return (
    <Sheet
      visible
      title="Register a product"
      subtitle="An application that raises tickets without a human login"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Register"
            icon="checkmark"
            loading={create.busy}
            disabled={!ready}
            {...(ready ? {} : { accessibilityHint: 'A code and a name are needed' })}
            onPress={() =>
              void create.run({
                code: code.trim().toUpperCase(),
                name: name.trim(),
                projectId,
              })
            }
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field
        label="Code"
        required
        hint="Short and stable — this is what the calling system is configured against."
      >
        <Input
          accessibilityLabel="Code"
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          placeholder="CARELIX"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Field>
      <Field label="Name" required>
        <Input
          accessibilityLabel="Name"
          value={name}
          onChangeText={setName}
          placeholder="Carelix"
        />
      </Field>
      <SelectField
        label="Support project"
        icon="folder-outline"
        hint="Can be set later, but support requests are refused until it is."
        options={options}
        value={projectId ? [projectId] : []}
        onChange={(ids) => setProjectId(ids[0] ?? null)}
        allowClear
        clearLabel="Choose later"
        placeholder="Choose later"
        loading={projects.isLoading}
      />
      {create.error ? (
        <Banner tone="danger" role="alert">
          {create.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
