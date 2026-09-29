import type { WhatsAppSettings } from '@ashniva/types';

import { Section } from '../../../shared/components/layout';
import { Field, Input } from '../../../shared/components/primitives';
import { SecretField } from '../shared/SecretField';
import { SettingSwitch } from '../shared/SettingSwitch';
import type { WhatsAppForm } from './whatsapp-form';

/** The Meta account fields. All three secrets are write-only, as on the web. */
export function WhatsAppFields({
  form,
  settings,
  editable,
  onChange,
}: {
  form: WhatsAppForm;
  settings: WhatsAppSettings | null;
  editable: boolean;
  onChange: (patch: Partial<WhatsAppForm>) => void;
}) {
  const text = (
    key:
      | 'businessAccountId'
      | 'phoneNumberId'
      | 'displayPhoneNumber'
      | 'apiVersion'
      | 'templateLanguage',
    numeric = false,
  ) => ({
    value: form[key],
    onChangeText: (value: string) => onChange({ [key]: value }),
    editable,
    autoCapitalize: 'none' as const,
    autoCorrect: false,
    ...(numeric ? { keyboardType: 'number-pad' as const } : {}),
  });

  return (
    <Section title="Meta account" icon="logo-whatsapp">
      <Field
        label="Business account id"
        required
        hint="The WhatsApp Business Account (WABA) id from Meta"
      >
        <Input
          {...text('businessAccountId', true)}
          accessibilityLabel="Business account id"
          placeholder="102290129340398"
        />
      </Field>
      <Field label="Phone number id" required hint="The id, not the number itself">
        <Input
          {...text('phoneNumberId', true)}
          accessibilityLabel="Phone number id"
          placeholder="106540352242922"
        />
      </Field>
      <Field label="Display number" hint="Shown in this screen only">
        <Input
          {...text('displayPhoneNumber')}
          accessibilityLabel="Display number"
          placeholder="+441234567890"
          keyboardType="phone-pad"
        />
      </Field>
      <Field label="Graph API version">
        <Input {...text('apiVersion')} accessibilityLabel="Graph API version" placeholder="v21.0" />
      </Field>
      <Field label="Template language" hint="The language your templates were approved in">
        <Input
          {...text('templateLanguage')}
          accessibilityLabel="Template language"
          placeholder="en"
        />
      </Field>
      <SecretField
        label="Access token"
        stored={settings?.hasAccessToken ?? false}
        value={form.accessToken}
        onChange={(accessToken) => onChange({ accessToken })}
        editable={editable}
        storedHint="A token is stored. Leave blank to keep it."
      />
      <SecretField
        label="App secret"
        stored={settings?.hasAppSecret ?? false}
        value={form.appSecret}
        onChange={(appSecret) => onChange({ appSecret })}
        editable={editable}
        emptyHint="Signs inbound webhooks. Without it, every delivery is rejected."
      />
      <SecretField
        label="Verify token"
        stored={settings?.hasVerifyToken ?? false}
        value={form.verifyToken}
        onChange={(verifyToken) => onChange({ verifyToken })}
        editable={editable}
        emptyHint="Any string you choose. Enter the same one in Meta’s webhook setup."
      />
      <SettingSwitch
        label="Send WhatsApp messages"
        description="Turn off to keep the settings but stop sending."
        value={form.enabled}
        onChange={(enabled) => onChange({ enabled })}
        disabled={!editable}
      />
    </Section>
  );
}
