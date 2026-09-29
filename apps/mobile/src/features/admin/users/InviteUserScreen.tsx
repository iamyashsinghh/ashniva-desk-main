import { PERMISSIONS, isClientRole, type UserCreatedResponse } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import {
  Grow,
  Section,
  StickyActionBar,
  useStackKeyboardOffset,
} from '../../../shared/components/layout';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { scopeOf, useAdminMutation, type ReauthHeaders } from '../shared/admin-api';
import { NotAllowed } from '../shared/AdminStates';
import { InvitationLink } from '../shared/InvitationLink';
import { useCompanyScope } from '../shared/OrganizationSwitcher';
import { ReauthSheet } from '../shared/ReauthSheet';
import { InviteUserFields } from './InviteUserFields';
import { emptyInviteForm, inviteBody, inviteReady, type InviteForm } from './invite-form';
import { defaultRoleChoice, useRoleChoices } from './user-roles';
import { USER_WRITES, useTeams } from './users-api';

/**
 * Add a person to a company — invited by link by default, or with a password you set.
 *
 * Creating somebody chooses their role and, for an invitation, hands back a credential for the
 * new account, so the API asks for the signed-in person's password first. That is a separate step
 * with only a password field, as on the web: a form with the new person's email beside a password
 * box invites the phone's password manager to fill in the wrong account.
 */
export function InviteUserScreen({
  organizationId,
  onOpenUser,
  onDone,
}: {
  /** The company, when it is not the signed-in person's own. */
  organizationId?: string;
  onOpenUser: (userId: string, organizationId: string | undefined) => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { user, can } = useSession();
  const scope = scopeOf(organizationId, user?.organization.id);
  const allowed = can(PERMISSIONS.USER_MANAGE);
  const company = useCompanyScope(organizationId ?? user?.organization.id ?? '', allowed);
  const actorIsClient = user ? isClientRole(user.roleKey) : true;
  const roles = useRoleChoices(scope, company.targetIsServiceProvider);
  const teams = useTeams(allowed && company.isProvider && company.isOwn);
  const fallbackRole = defaultRoleChoice(actorIsClient, company.targetIsServiceProvider);
  const [draft, setDraft] = useState<InviteForm>(() => emptyInviteForm(fallbackRole));
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState<UserCreatedResponse | null>(null);

  // The company's kind arrives after the first draw for the provider's staff; a role chosen
  // before then may not be one this company can hold, so it falls back rather than being sent.
  const roleOffered = roles.options.some((option) => option.value === draft.role);
  const form = roleOffered || roles.loading ? draft : { ...draft, role: fallbackRole };

  const create = useAdminMutation<
    { values: InviteForm; headers: ReauthHeaders },
    UserCreatedResponse
  >({
    path: () => '/users',
    body: ({ values }) => inviteBody(values, scope),
    headers: ({ headers }) => headers,
    invalidate: USER_WRITES,
    onSuccess: (result) => {
      setConfirming(false);
      setCreated(result);
    },
  });

  if (!allowed) {
    return <NotAllowed message="Adding people needs the user management permission." />;
  }

  if (created) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        >
          {created.invitation ? (
            <InvitationLink name={created.name} invitation={created.invitation} />
          ) : (
            <Banner tone="success" title={`${created.name} can sign in now`}>
              Give them the password you set, privately.
            </Banner>
          )}
          <Section>
            <AppText weight="medium">{created.name}</AppText>
            <AppText size="sm" tone="muted">
              {created.email} · {created.roleName}
            </AppText>
          </Section>
        </ScrollView>
        <StickyActionBar>
          <Grow>
            <Button
              label="Add another"
              icon="person-add-outline"
              variant="secondary"
              onPress={() => {
                setCreated(null);
                setDraft(emptyInviteForm(form.role));
              }}
            />
          </Grow>
          <Grow>
            <Button
              label="Open profile"
              icon="person-outline"
              onPress={() => onOpenUser(created.id, scope)}
            />
          </Grow>
        </StickyActionBar>
      </Screen>
    );
  }

  const ready = inviteReady(form) && !company.loading;
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
          <View style={{ gap: theme.spacing.xs }}>
            <AppText size="sm" tone="muted">
              {`Adding to ${company.targetName}`}
            </AppText>
          </View>
          <InviteUserFields
            form={form}
            onChange={(change) => {
              create.reset();
              setDraft((current) => ({ ...current, role: form.role, ...change }));
            }}
            roleOptions={roles.options}
            rolesLoading={roles.loading}
            teams={company.isProvider && company.isOwn ? (teams.data ?? []) : []}
          />
        </ScrollView>
        <StickyActionBar>
          <Grow>
            <Button label="Cancel" variant="secondary" onPress={onDone} />
          </Grow>
          <Grow>
            <Button
              label={form.mode === 'invite' ? 'Invite' : 'Add person'}
              icon="person-add-outline"
              disabled={!ready}
              onPress={() => setConfirming(true)}
            />
          </Grow>
        </StickyActionBar>
      </KeyboardAvoidingView>
      <ReauthSheet
        visible={confirming}
        title="Confirm it is you"
        subtitle={`Creating ${form.name.trim() || 'this person'}`}
        confirmLabel="Create person"
        busy={create.busy}
        error={create.error}
        onClose={() => setConfirming(false)}
        onConfirm={(headers) => create.run({ values: form, headers })}
      />
    </Screen>
  );
}
