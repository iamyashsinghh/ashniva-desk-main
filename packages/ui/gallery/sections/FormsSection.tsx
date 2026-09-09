import { useState } from 'react';

import { Button } from '../../src/components/button/Button';
import { FieldGroup } from '../../src/components/form/FieldGroup';
import { FormField } from '../../src/components/form/FormField';
import { FormActions, FormGrid, FormGridFull } from '../../src/components/form/FormLayout';
import { Input } from '../../src/components/form/Input';
import { Select } from '../../src/components/form/Select';
import { Textarea } from '../../src/components/form/Textarea';
import { SegmentedControl } from '../../src/components/tabs/Tabs';
import { Section, Specimen } from '../Specimen';

export function FormsSection() {
  const [priority, setPriority] = useState('MEDIUM');

  return (
    <Section
      id="forms"
      title="Forms"
      summary="Every label is tied to its control, every hint and error is in the control's accessible description, and a group of controls is a fieldset with a legend."
    >
      <Specimen label="Field states">
        <FormGrid>
          <FormField
            label="Task title"
            required
            hint="Shown to the client when the task is visible"
          >
            <Input defaultValue="Migrate the billing importer" />
          </FormField>
          <FormField label="Module" optional>
            <Input placeholder="e.g. Billing" />
          </FormField>
          <FormField label="Estimate" error="Estimates are recorded in minutes">
            <Input defaultValue="two hours" />
          </FormField>
          <FormField label="Project">
            <Select
              placeholder="Choose a project"
              defaultValue=""
              options={[
                { value: 'apollo', label: 'Apollo' },
                { value: 'hermes', label: 'Hermes' },
              ]}
            />
          </FormField>
          <FormField label="Closed field">
            <Input defaultValue="Cannot be changed" disabled />
          </FormField>
          <FormField label="Read-only field">
            <Input defaultValue="ACM-412" readOnly />
          </FormField>
          <FormGridFull>
            <FormField label="Description" hint="Markdown is not rendered here">
              <Textarea defaultValue="Move the importer onto the new queue and retire the cron." />
            </FormField>
          </FormGridFull>
          <FormGridFull>
            <FieldGroup legend="Priority" required hint="Critical pages the on-call rota">
              <SegmentedControl
                aria-label="Priority"
                size="sm"
                value={priority}
                onChange={setPriority}
                options={[
                  { key: 'LOW', label: 'Low' },
                  { key: 'MEDIUM', label: 'Medium' },
                  { key: 'HIGH', label: 'High' },
                  { key: 'CRITICAL', label: 'Critical' },
                ]}
              />
            </FieldGroup>
          </FormGridFull>
          <FormGridFull>
            <FieldGroup legend="Outcome" error="Choose a result before submitting">
              <SegmentedControl
                aria-label="Outcome"
                size="sm"
                value="pass"
                onChange={() => {}}
                options={[
                  { key: 'pass', label: 'Passed' },
                  { key: 'fail', label: 'Failed' },
                ]}
              />
            </FieldGroup>
          </FormGridFull>
        </FormGrid>
      </Specimen>

      <Specimen label="Form actions">
        <FormActions>
          <Button>Cancel</Button>
          <Button variant="primary">Save task</Button>
        </FormActions>
      </Specimen>
    </Section>
  );
}
