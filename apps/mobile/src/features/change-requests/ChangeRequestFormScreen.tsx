import { PERMISSIONS, type ChangeRequestDetail } from '@ashniva/types';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Section, StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Field, Input, Screen } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import {
  useClientContactOptions,
  useClientContractOptions,
  useClientOptions,
  useClientProjectOptions,
} from '../contracts/commercial-options';
import { NotAvailable, RecordPending } from '../contracts/commercial-ui';
import { CHANGE_REQUEST_INVALIDATES } from './change-request-display';
import {
  changeRequestPayload,
  initialChangeRequestForm,
  validateChangeRequestForm,
  type ChangeRequestFormState,
} from './change-request-form';

/** Raise a change request on a client's behalf, or edit one. A new one is saved as a draft. */
export function ChangeRequestFormScreen({
  changeRequestId,
  onSaved,
}: {
  /** Omit to raise a new one. */
  changeRequestId?: string;
  onSaved: (changeRequestId: string) => void;
}) {
  const { can } = useSession();
  const query = useResource<ChangeRequestDetail>(
    ['change-requests', 'detail', changeRequestId],
    `/change-requests/${changeRequestId}`,
    { enabled: Boolean(changeRequestId) },
  );
  if (!can(PERMISSIONS.CHANGE_REQUEST_RAISE)) {
    return (
      <NotAvailable>
        Raising and editing change requests needs permission to raise them.
      </NotAvailable>
    );
  }
  if (changeRequestId && !query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the change request"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ChangeRequestForm existing={query.data ?? null} onSaved={onSaved} />;
}

type TextKey = 'title' | 'description' | 'businessReason' | 'scope' | 'impact';

function ChangeRequestForm({
  existing,
  onSaved,
}: {
  existing: ChangeRequestDetail | null;
  onSaved: (changeRequestId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const editing = existing !== null;
  const [form, setForm] = useState<ChangeRequestFormState>(() =>
    initialChangeRequestForm(existing),
  );
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateChangeRequestForm(form, editing) : {};
  const clients = useClientOptions(!editing);
  const projects = useClientProjectOptions(form.clientOrganizationId);
  const contracts = useClientContractOptions(editing ? null : form.clientOrganizationId);
  const contacts = useClientContactOptions(editing ? null : form.clientOrganizationId);

  const save = useApiMutation<Record<string, unknown>, ChangeRequestDetail>({
    path: existing ? `/change-requests/${existing.id}` : '/change-requests',
    method: existing ? 'PATCH' : 'POST',
    body: (body) => body,
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: (saved) => onSaved(saved.id),
  });

  const set = (patch: Partial<ChangeRequestFormState>) => {
    save.reset();
    setForm((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    setAttempted(true);
    if (Object.keys(validateChangeRequestForm(form, editing)).length === 0) {
      void save.run(changeRequestPayload(form, editing));
    }
  };

  const text = (
    key: TextKey,
    label: string,
    extra: ComponentProps<typeof Input> & { required?: boolean; hint?: string } = {},
  ) => {
    const { required, hint, ...input } = extra;
    return (
      <Field
        label={label}
        {...(required ? { required } : {})}
        {...(hint ? { hint } : {})}
        {...(errors[key] ? { error: errors[key] } : {})}
      >
        <Input
          accessibilityLabel={label}
          value={form[key]}
          invalid={Boolean(errors[key])}
          onChangeText={(value) => set({ [key]: value })}
          {...input}
        />
      </Field>
    );
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
            <Banner tone="danger" title="Could not save the change request" role="alert">
              {save.error}
            </Banner>
          ) : null}
          <Section title={editing ? 'Where it applies' : 'Who it is for'} icon="business-outline">
            {editing ? null : (
              <>
                <SelectField
                  label="Client"
                  icon="business-outline"
                  required
                  options={clients.options}
                  value={form.clientOrganizationId ? [form.clientOrganizationId] : []}
                  onChange={(ids) =>
                    set({
                      clientOrganizationId: ids[0] ?? null,
                      requestedById: null,
                      projectId: null,
                      contractId: null,
                    })
                  }
                  loading={clients.isLoading}
                  placeholder="Choose a client"
                  {...(errors.clientOrganizationId ? { error: errors.clientOrganizationId } : {})}
                />
                {contacts.allowed ? (
                  <SelectField
                    label="Requested by (client contact)"
                    icon="person-outline"
                    options={contacts.options}
                    value={form.requestedById ? [form.requestedById] : []}
                    onChange={(ids) => set({ requestedById: ids[0] ?? null })}
                    loading={contacts.isLoading}
                    disabled={!form.clientOrganizationId}
                    allowClear
                    clearLabel="Me"
                    placeholder="Me"
                  />
                ) : null}
                <SelectField
                  label="Contract"
                  icon="document-text-outline"
                  options={contracts.options}
                  value={form.contractId ? [form.contractId] : []}
                  onChange={(ids) => set({ contractId: ids[0] ?? null })}
                  loading={contracts.isLoading}
                  disabled={!form.clientOrganizationId}
                  allowClear
                  clearLabel="None"
                  placeholder="None"
                />
              </>
            )}
            <SelectField
              label="Project"
              icon="folder-outline"
              options={projects.options}
              value={form.projectId ? [form.projectId] : []}
              onChange={(ids) => set({ projectId: ids[0] ?? null })}
              loading={projects.isLoading}
              allowClear
              clearLabel="None"
              placeholder="None"
            />
          </Section>
          <Section title="The change" icon="reader-outline">
            {text('title', 'Title', { required: true, maxLength: 200 })}
            {text('description', 'What should change', {
              required: true,
              multiline: true,
              maxLength: 10000,
              style: { minHeight: 110 },
            })}
            {text('businessReason', 'Business reason', {
              multiline: true,
              maxLength: 5000,
              style: { minHeight: 72 },
            })}
            {text('scope', 'Scope', {
              multiline: true,
              maxLength: 10000,
              style: { minHeight: 72 },
            })}
            {text('impact', 'Impact', {
              multiline: true,
              maxLength: 5000,
              style: { minHeight: 72 },
            })}
          </Section>
        </ScrollView>
        <StickyActionBar>
          <Button
            label={editing ? 'Save' : 'Save draft'}
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
