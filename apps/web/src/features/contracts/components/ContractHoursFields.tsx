import {
  BILLING_PERIOD,
  BILLING_PERIOD_LABELS,
  CARRY_FORWARD_RULE,
  CARRY_FORWARD_RULE_LABELS,
} from '@ashniva/types';
import { FormField, Input, Select } from '@ashniva/ui';

import type { ContractFormState } from '../contract-form';

interface ContractHoursFieldsProps {
  form: ContractFormState;
  set: <K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) => void;
}

/** Billing period, carry-forward rule and the low-hours warning of an hour-tracking contract. */
export function ContractHoursFields({ form, set }: ContractHoursFieldsProps) {
  return (
    <>
      <FormField label="Billing period">
        <Select
          value={form.billingPeriod}
          onChange={(event) =>
            set('billingPeriod', event.target.value as typeof form.billingPeriod)
          }
          options={Object.values(BILLING_PERIOD).map((period) => ({
            value: period,
            label: BILLING_PERIOD_LABELS[period],
          }))}
        />
      </FormField>
      <FormField label="Carry forward">
        <Select
          value={form.carryForwardRule}
          onChange={(event) =>
            set('carryForwardRule', event.target.value as typeof form.carryForwardRule)
          }
          options={Object.values(CARRY_FORWARD_RULE).map((rule) => ({
            value: rule,
            label: CARRY_FORWARD_RULE_LABELS[rule],
          }))}
        />
      </FormField>
      {form.carryForwardRule === CARRY_FORWARD_RULE.CAPPED ? (
        <FormField label="Carry-forward cap (hours)">
          <Input
            inputMode="decimal"
            value={form.carryForwardCapHours}
            onChange={(event) => set('carryForwardCapHours', event.target.value)}
          />
        </FormField>
      ) : null}
      <FormField label="Low-hours warning at (hours)">
        <Input
          inputMode="decimal"
          value={form.lowHoursThresholdHours}
          onChange={(event) => set('lowHoursThresholdHours', event.target.value)}
        />
      </FormField>
    </>
  );
}
