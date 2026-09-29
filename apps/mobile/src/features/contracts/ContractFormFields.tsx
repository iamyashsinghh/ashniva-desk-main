import {
  BILLING_PERIOD,
  BILLING_PERIOD_LABELS,
  CARRY_FORWARD_RULE,
  CARRY_FORWARD_RULE_LABELS,
  CONTRACT_STATUS,
  type ContractStatus,
} from '@ashniva/types';
import type { ComponentProps } from 'react';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Section } from '../../shared/components/layout';
import { Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { ToggleRow } from '../tasks/ToggleRow';
import { useClientOptions, useClientProjectOptions } from './commercial-options';
import { CONTRACT_TYPE_OPTIONS, contractStatusLabel } from './contract-display';
import { tracksHours, type ContractFormErrors, type ContractFormState } from './contract-form';

const BILLING_OPTIONS = Object.values(BILLING_PERIOD).map((period) => ({
  value: period,
  label: BILLING_PERIOD_LABELS[period],
}));

const CARRY_OPTIONS = Object.values(CARRY_FORWARD_RULE).map((rule) => ({
  value: rule,
  label: CARRY_FORWARD_RULE_LABELS[rule],
}));

/** The fields typed as free text: plain strings, not a choice from a list and never null. */
type TextKey = {
  [K in keyof ContractFormState]: [ContractFormState[K]] extends [string]
    ? string extends ContractFormState[K]
      ? K
      : never
    : never;
}[keyof ContractFormState];

/** A new contract starts as a draft or goes live; an existing one can also be marked expired. */
function statusOptions(editing: boolean) {
  const statuses: ContractStatus[] = editing
    ? [CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.EXPIRED]
    : [CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.ACTIVE];
  return statuses.map((status) => ({ value: status, label: contractStatusLabel(status) }));
}

export function ContractFormFields({
  form,
  set,
  errors,
  editing,
  canSeeCost,
}: {
  form: ContractFormState;
  set: <K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) => void;
  errors: ContractFormErrors;
  editing: boolean;
  canSeeCost: boolean;
}) {
  const clients = useClientOptions();
  const projects = useClientProjectOptions(form.clientOrganizationId);
  const hours = tracksHours(form);

  const text = (key: TextKey, label: string, extra: ComponentProps<typeof Input> = {}) => (
    <Input
      accessibilityLabel={label}
      value={form[key]}
      invalid={Boolean(errors[key])}
      onChangeText={(value) => set(key, value)}
      {...extra}
    />
  );

  return (
    <>
      <Section title="Client and type" icon="business-outline">
        <SelectField
          label="Client"
          icon="business-outline"
          required
          options={clients.options}
          value={form.clientOrganizationId ? [form.clientOrganizationId] : []}
          onChange={(ids) => {
            set('clientOrganizationId', ids[0] ?? null);
            set('projectId', null);
          }}
          loading={clients.isLoading}
          disabled={editing}
          placeholder="Choose a client"
          {...(editing ? { hint: 'The client of a contract cannot be changed.' } : {})}
          {...(errors.clientOrganizationId ? { error: errors.clientOrganizationId } : {})}
        />
        <SelectField
          label="Project"
          icon="folder-outline"
          options={projects.options}
          value={form.projectId ? [form.projectId] : []}
          onChange={(ids) => set('projectId', ids[0] ?? null)}
          loading={projects.isLoading}
          disabled={!form.clientOrganizationId}
          allowClear
          clearLabel="Whole client"
          placeholder="Whole client"
        />
        <SelectField
          label="Type"
          icon="pricetag-outline"
          required
          options={CONTRACT_TYPE_OPTIONS}
          value={[form.type]}
          onChange={(values) => set('type', values[0] ?? form.type)}
        />
        <SelectField
          label="Status"
          icon="flag-outline"
          options={statusOptions(editing)}
          value={[form.status]}
          onChange={(values) => set('status', values[0] ?? form.status)}
        />
        <Field label="Title" required {...(errors.title ? { error: errors.title } : {})}>
          {text('title', 'Title', { maxLength: 200 })}
        </Field>
      </Section>

      <Section title="Dates and money" icon="calendar-outline">
        <DateTimeField
          label="Start date"
          required
          allowClear={false}
          value={form.startDate}
          onChange={(value) => set('startDate', value)}
          {...(errors.startDate ? { error: errors.startDate } : {})}
        />
        <DateTimeField
          label="End date"
          value={form.endDate}
          onChange={(value) => set('endDate', value)}
          {...(errors.endDate ? { error: errors.endDate } : {})}
        />
        <DateTimeField
          label="Renewal date"
          value={form.renewalDate}
          onChange={(value) => set('renewalDate', value)}
        />
        <ToggleRow
          label="Auto-renews"
          description="The contract rolls over on its renewal date unless somebody stops it."
          icon="repeat-outline"
          value={form.autoRenew}
          onChange={(value) => set('autoRenew', value)}
        />
        <Field label="Currency" required {...(errors.currency ? { error: errors.currency } : {})}>
          {text('currency', 'Currency', { maxLength: 3, autoCapitalize: 'characters' })}
        </Field>
        <Field
          label="Contract value"
          {...(errors.contractValue ? { error: errors.contractValue } : {})}
        >
          {text('contractValue', 'Contract value', { keyboardType: 'decimal-pad' })}
        </Field>
        {canSeeCost ? (
          <Field
            label="Internal cost"
            hint="Team only. Never shown to the client."
            {...(errors.internalCost ? { error: errors.internalCost } : {})}
          >
            {text('internalCost', 'Internal cost', { keyboardType: 'decimal-pad' })}
          </Field>
        ) : null}
      </Section>

      <Section title="Support hours" icon="hourglass-outline">
        <Field
          label="Included hours per period"
          {...(errors.includedHours ? { error: errors.includedHours } : {})}
        >
          {text('includedHours', 'Included hours per period', { keyboardType: 'decimal-pad' })}
        </Field>
        {hours ? (
          <>
            <SelectField
              label="Billing period"
              icon="repeat-outline"
              options={BILLING_OPTIONS}
              value={[form.billingPeriod]}
              onChange={(values) => set('billingPeriod', values[0] ?? form.billingPeriod)}
            />
            <SelectField
              label="Carry forward"
              icon="arrow-redo-outline"
              options={CARRY_OPTIONS}
              value={[form.carryForwardRule]}
              onChange={(values) => set('carryForwardRule', values[0] ?? form.carryForwardRule)}
            />
            {form.carryForwardRule === CARRY_FORWARD_RULE.CAPPED ? (
              <Field
                label="Carry-forward cap (hours)"
                {...(errors.carryForwardCapHours ? { error: errors.carryForwardCapHours } : {})}
              >
                {text('carryForwardCapHours', 'Carry-forward cap (hours)', {
                  keyboardType: 'decimal-pad',
                })}
              </Field>
            ) : null}
            <Field
              label="Low-hours warning at (hours)"
              {...(errors.lowHoursThresholdHours ? { error: errors.lowHoursThresholdHours } : {})}
            >
              {text('lowHoursThresholdHours', 'Low-hours warning at (hours)', {
                keyboardType: 'decimal-pad',
              })}
            </Field>
          </>
        ) : null}
      </Section>

      <Section title="Scope and notes" icon="reader-outline">
        <Field label="Scope" hint="The client sees this.">
          {text('scope', 'Scope', { multiline: true, style: { minHeight: 96 } })}
        </Field>
        <Field label="Notes for the client" hint="The client sees this.">
          {text('clientNotes', 'Notes for the client', {
            multiline: true,
            style: { minHeight: 72 },
          })}
        </Field>
        <Field label="Internal notes" hint="Team only. Never shown to the client.">
          {text('internalNotes', 'Internal notes', { multiline: true, style: { minHeight: 72 } })}
        </Field>
      </Section>
    </>
  );
}
