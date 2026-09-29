import { EMAIL_ENCRYPTION_LABELS, type EmailEncryption } from '@ashniva/types';

import { Section } from '../../../shared/components/layout';
import { Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { SecretField } from '../shared/SecretField';
import { SettingSwitch } from '../shared/SettingSwitch';
import type { EmailForm } from './email-form';

const ENCRYPTIONS = (Object.keys(EMAIL_ENCRYPTION_LABELS) as EmailEncryption[]).map((value) => ({
  value,
  label: EMAIL_ENCRYPTION_LABELS[value],
}));

/** The SMTP server and sender. Read-only (no inputs take focus) for somebody who may only read. */
export function EmailFields({
  form,
  hasPassword,
  editable,
  onChange,
}: {
  form: EmailForm;
  hasPassword: boolean;
  editable: boolean;
  onChange: (patch: Partial<EmailForm>) => void;
}) {
  return (
    <>
      <Section title="Server" icon="server-outline">
        <Field label="Server" required>
          <Input
            accessibilityLabel="Server"
            value={form.host}
            onChangeText={(host) => onChange({ host })}
            placeholder="smtp.example.com"
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        <Field label="Port" required>
          <Input
            accessibilityLabel="Port"
            value={form.port}
            onChangeText={(port) => onChange({ port })}
            editable={editable}
            keyboardType="number-pad"
          />
        </Field>
        <SelectField
          label="Encryption"
          required
          options={ENCRYPTIONS}
          value={[form.encryption]}
          onChange={(ids) => ids[0] && onChange({ encryption: ids[0] as EmailEncryption })}
          disabled={!editable}
        />
        <Field label="Username">
          <Input
            accessibilityLabel="Username"
            value={form.username}
            onChangeText={(username) => onChange({ username })}
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
        </Field>
        <SecretField
          label="Password"
          stored={hasPassword}
          value={form.password}
          onChange={(password) => onChange({ password })}
          editable={editable}
          storedHint="A password is stored. Leave blank to keep it."
        />
      </Section>
      <Section title="Sender" icon="mail-outline">
        <Field label="Sender name" required>
          <Input
            accessibilityLabel="Sender name"
            value={form.senderName}
            onChangeText={(senderName) => onChange({ senderName })}
            placeholder="Ashniva Desk"
            editable={editable}
          />
        </Field>
        <Field label="Sender address" required>
          <Input
            accessibilityLabel="Sender address"
            value={form.senderEmail}
            onChangeText={(senderEmail) => onChange({ senderEmail })}
            placeholder="noreply@example.com"
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </Field>
        <Field label="Reply-to" hint="Where a reply should go, if not the sender address">
          <Input
            accessibilityLabel="Reply-to"
            value={form.replyTo}
            onChangeText={(replyTo) => onChange({ replyTo })}
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </Field>
        <SettingSwitch
          label="Send email"
          description="Turn off to keep the settings but stop sending."
          value={form.enabled}
          onChange={(enabled) => onChange({ enabled })}
          disabled={!editable}
        />
      </Section>
    </>
  );
}
