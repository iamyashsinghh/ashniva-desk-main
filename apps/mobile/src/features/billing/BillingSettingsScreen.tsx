import { PERMISSIONS, type BillingProfile, type ClientBillingProfile } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Banner, SuccessNote } from '../../shared/components/feedback';
import { StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { billingKeys } from './billing-api';
import {
  billingFormFrom,
  billingFormProblem,
  billingPayloadFrom,
  type BillingProfileForm,
  type BindProfileField,
} from './billing-form';
import { BillingDefaultsFields } from './BillingDefaultsFields';
import { BillingIdentityFields } from './BillingIdentityFields';
import { ClientBillingSection } from './ClientBillingSection';
import { useGuardedWrite } from './guarded-write';
import { PasswordConfirmSheet } from './PasswordConfirmSheet';

/**
 * Who invoices are from, how they are numbered, and who each one is billed to — the web's billing
 * settings page.
 *
 * Saving needs `billing-profile:manage`, the permission `PUT /settings/billing` checks; anybody
 * else who reaches the screen reads it but is not offered a save that would 403. The profile holds
 * the bank account every invoice tells a client to pay into, so the API asks for the password again.
 */
export function BillingSettingsScreen() {
  const profile = useResource<BillingProfile | null>(billingKeys.profile, '/settings/billing');
  const recorded = useResource<ClientBillingProfile[]>(
    billingKeys.clientProfiles,
    '/settings/billing/clients',
  );

  if (profile.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(profile.error)}
          offline={profile.error instanceof Error && profile.error.name === 'NetworkError'}
          onRetry={() => void profile.refetch()}
        />
      </Screen>
    );
  }
  if (profile.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading billing settings" />
      </Screen>
    );
  }
  return <SettingsForm profile={profile.data ?? null} recorded={recorded.data ?? []} />;
}

function SettingsForm({
  profile,
  recorded,
}: {
  profile: BillingProfile | null;
  recorded: readonly ClientBillingProfile[];
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.BILLING_PROFILE_MANAGE);
  const [form, setForm] = useState<BillingProfileForm>(() => billingFormFrom(profile));
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const write = useGuardedWrite<BillingProfileForm, BillingProfile>({
    path: '/settings/billing',
    method: 'PUT',
    body: billingPayloadFrom,
    invalidate: [billingKeys.profile],
    onSuccess: () => {
      setConfirming(false);
      setSaved(true);
    },
  });

  const patch = (change: Partial<BillingProfileForm>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...change }));
  };
  const bind: BindProfileField = (key, transform) => ({
    value: form[key],
    editable: canManage,
    onChange: (value) => patch({ [key]: transform ? transform(value) : value }),
  });
  const problem = billingFormProblem(form);

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
          {canManage ? null : (
            <Banner tone="neutral" title="Read only">
              Changing billing details needs the billing profile permission.
            </Banner>
          )}
          {profile ? null : (
            <Banner tone="warning" title="Not set up yet">
              Invoices cannot be raised until your legal name, address, state code and GSTIN are
              saved here.
            </Banner>
          )}
          <BillingIdentityFields bind={bind} />
          <BillingDefaultsFields
            form={form}
            bind={bind}
            onPatch={patch}
            profile={profile}
            readOnly={!canManage}
          />
          <ClientBillingSection recorded={recorded} canManage={canManage} />
        </ScrollView>
        {canManage ? (
          <StickyActionBar
            note={
              saved ? (
                <SuccessNote label="Billing details saved" />
              ) : (
                <AppText size="xs" tone="muted">
                  {problem ?? 'Saving changes the account clients are told to pay into.'}
                </AppText>
              )
            }
          >
            <Button
              label="Save billing details"
              icon="save-outline"
              disabled={problem !== null}
              onPress={() => {
                write.reset();
                setConfirming(true);
              }}
              style={{ flex: 1 }}
            />
          </StickyActionBar>
        ) : null}
      </KeyboardAvoidingView>
      {confirming ? (
        <PasswordConfirmSheet
          title="Save billing details"
          message="These details change the account clients are told to pay into, so the server asks for your password again."
          confirmLabel="Save"
          busy={write.busy}
          error={write.error}
          onEdit={write.reset}
          onClose={() => setConfirming(false)}
          onConfirm={(password) => void write.run(form, password)}
        />
      ) : null}
    </Screen>
  );
}
