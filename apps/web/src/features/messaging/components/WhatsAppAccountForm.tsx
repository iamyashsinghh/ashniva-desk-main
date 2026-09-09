import type { MessageTemplate, WhatsAppSettings } from '@ashniva/types';
import { Button, Card, FormField, FormGrid, Input, Switch } from '@ashniva/ui';
export interface WhatsAppForm {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  apiVersion: string;
  templateLanguage: string;
  templateNames: Partial<Record<MessageTemplate, string>>;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  enabled: boolean;
}

interface WhatsAppAccountFormProps {
  form: WhatsAppForm;
  settings: WhatsAppSettings | null;
  saving: boolean;
  onChange: (form: WhatsAppForm) => void;
  onSave: () => void;
}

/** The Meta account fields. All three secret boxes are write-only, by design. */
export function WhatsAppAccountForm({
  form,
  settings,
  saving,
  onChange,
  onSave,
}: WhatsAppAccountFormProps) {
  const set = (patch: Partial<WhatsAppForm>) => onChange({ ...form, ...patch });
  const valid = /^\d{5,25}$/.test(form.businessAccountId) && /^\d{5,25}$/.test(form.phoneNumberId);

  return (
    <Card title="Meta account">
      <FormGrid>
        <FormField
          label="Business account id"
          required
          hint="The WhatsApp Business Account (WABA) id from Meta"
        >
          <Input
            value={form.businessAccountId}
            placeholder="102290129340398"
            onChange={(event) => set({ businessAccountId: event.target.value })}
          />
        </FormField>
        <FormField label="Phone number id" required hint="The id, not the number itself">
          <Input
            value={form.phoneNumberId}
            placeholder="106540352242922"
            onChange={(event) => set({ phoneNumberId: event.target.value })}
          />
        </FormField>
        <FormField label="Display number" hint="Shown in this screen only">
          <Input
            value={form.displayPhoneNumber}
            placeholder="+441234567890"
            onChange={(event) => set({ displayPhoneNumber: event.target.value })}
          />
        </FormField>
        <FormField label="Graph API version">
          <Input
            value={form.apiVersion}
            placeholder="v21.0"
            onChange={(event) => set({ apiVersion: event.target.value })}
          />
        </FormField>
        <FormField label="Template language" hint="The language your templates were approved in">
          <Input
            value={form.templateLanguage}
            placeholder="en"
            onChange={(event) => set({ templateLanguage: event.target.value })}
          />
        </FormField>

        <FormField
          label="Access token"
          hint={
            settings?.hasAccessToken
              ? 'A token is stored. Leave blank to keep it.'
              : 'Stored encrypted and never shown again.'
          }
        >
          <Input
            type="password"
            value={form.accessToken}
            autoComplete="new-password"
            placeholder={settings?.hasAccessToken ? '••••••••' : ''}
            onChange={(event) => set({ accessToken: event.target.value })}
          />
        </FormField>
        <FormField
          label="App secret"
          hint={
            settings?.hasAppSecret
              ? 'Stored. Leave blank to keep it.'
              : 'Signs inbound webhooks. Without it, every delivery is rejected.'
          }
        >
          <Input
            type="password"
            value={form.appSecret}
            autoComplete="new-password"
            placeholder={settings?.hasAppSecret ? '••••••••' : ''}
            onChange={(event) => set({ appSecret: event.target.value })}
          />
        </FormField>
        <FormField
          label="Verify token"
          hint={
            settings?.hasVerifyToken
              ? 'Stored. Leave blank to keep it.'
              : 'Any string you choose. Enter the same one in Meta’s webhook setup.'
          }
        >
          <Input
            type="password"
            value={form.verifyToken}
            autoComplete="new-password"
            placeholder={settings?.hasVerifyToken ? '••••••••' : ''}
            onChange={(event) => set({ verifyToken: event.target.value })}
          />
        </FormField>

        <Switch
          label="Send WhatsApp messages"
          description="Turn off to keep the settings but stop sending"
          checked={form.enabled}
          onChange={(checked) => set({ enabled: checked })}
        />
      </FormGrid>
      <div className="detail-actions">
        <Button
          variant="primary"
          loading={saving}
          disabled={!valid}
          disabledReason="Both Meta ids are required, and are numeric"
          onClick={onSave}
        >
          Save settings
        </Button>
      </div>
    </Card>
  );
}
