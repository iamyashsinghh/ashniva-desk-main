import { Alert, Button, FormField, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useProjectsQuery } from '../../projects/api';
import { useProductMutations } from '../api';

export interface NewProductModalProps {
  onClose: () => void;
}

/**
 * Registering a product.
 *
 * Only the four fields that decide whether it can work at all: what it is called, its code, whose
 * team answers for it, and which Desk identity stands as requester on its tickets. Everything
 * else has a sensible default and is edited afterwards on the product's own page.
 */
export function NewProductModal({ onClose }: NewProductModalProps) {
  const navigate = useNavigate();
  const projects = useProjectsQuery({ status: 'ACTIVE' });
  const { create } = useProductMutations();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const { error, wrap } = useSubmitHandler(onClose);

  const submit = wrap(async () => {
    const product = await create.mutateAsync({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      projectId: projectId || null,
    });
    navigate(`/admin/products/${product.id}`);
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Register a product"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={code.trim().length < 2 || name.trim().length < 2}
            disabledReason="A code and a name are needed"
            onClick={() => void submit()}
          >
            Register
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <FormField
        label="Code"
        required
        hint="Short and stable — this is what the calling system is configured against."
      >
        <Input
          value={code}
          placeholder="CARELIX"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </FormField>
      <FormField label="Name" required>
        <Input
          value={name}
          placeholder="Carelix"
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField
        label="Support project"
        hint="Can be set later, but support requests are refused until it is."
      >
        <Select
          options={(projects.data ?? []).map((project) => ({
            value: project.id,
            label: `${project.code} · ${project.name}`,
          }))}
          placeholder="Choose later"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
      </FormField>
    </Modal>
  );
}
