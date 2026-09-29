import { PERMISSIONS, type ContractDetail } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { NotAvailable, RecordPending } from './commercial-ui';
import { CONTRACT_INVALIDATES } from './contract-display';
import {
  contractPayload,
  initialContractForm,
  validateContractForm,
  type ContractFormState,
} from './contract-form';
import { ContractFormFields } from './ContractFormFields';

/**
 * Create a contract, or edit one: the web form's fields, one column.
 *
 * Editing loads the contract first and only then builds the form, so a quick "Save" writes back
 * what is saved rather than the blanks of an empty form.
 */
export function ContractFormScreen({
  contractId,
  onSaved,
}: {
  /** Omit to create a contract. */
  contractId?: string;
  onSaved: (contractId: string) => void;
}) {
  const { can } = useSession();
  const query = useResource<ContractDetail>(
    ['contracts', 'detail', contractId],
    `/contracts/${contractId}`,
    { enabled: Boolean(contractId) },
  );

  if (!can(PERMISSIONS.CONTRACT_MANAGE)) {
    return (
      <NotAvailable>
        Creating and editing contracts needs the contract management permission.
      </NotAvailable>
    );
  }
  if (contractId && !query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the contract"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ContractForm contract={query.data ?? null} onSaved={onSaved} />;
}

function ContractForm({
  contract,
  onSaved,
}: {
  contract: ContractDetail | null;
  onSaved: (contractId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { can } = useSession();
  const canSeeCost = can(PERMISSIONS.COST_READ);
  const editing = contract !== null;
  const [form, setForm] = useState<ContractFormState>(() => initialContractForm(contract));
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateContractForm(form) : {};

  const save = useApiMutation<Record<string, unknown>, ContractDetail>({
    path: contract ? `/contracts/${contract.id}` : '/contracts',
    method: contract ? 'PATCH' : 'POST',
    body: (body) => body,
    invalidate: CONTRACT_INVALIDATES,
    onSuccess: (saved) => onSaved(saved.id),
  });

  const set = <K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) => {
    save.reset();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    setAttempted(true);
    if (Object.keys(validateContractForm(form)).length > 0) {
      return;
    }
    void save.run(contractPayload(form, { editing, canSeeCost }));
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          {save.error ? (
            <Banner tone="danger" title="Could not save the contract" role="alert">
              {save.error}
            </Banner>
          ) : null}
          {Object.keys(errors).length > 0 ? (
            <Banner tone="warning">Some fields need attention before this can be saved.</Banner>
          ) : null}
          <ContractFormFields
            form={form}
            set={set}
            errors={errors}
            editing={editing}
            canSeeCost={canSeeCost}
          />
        </ScrollView>
        <StickyActionBar>
          <Button
            label={editing ? 'Save changes' : 'Create contract'}
            icon="checkmark"
            loading={save.busy}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
