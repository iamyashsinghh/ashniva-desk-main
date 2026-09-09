import { EMAIL_ENCRYPTION_LABELS, type EmailEncryption, type EmailSettings } from '@ashniva/types';
import { Button, Card, FormField, FormGrid, Input, Select, Switch } from '@ashniva/ui';
const ENCRYPTIONS = Object.keys(EMAIL_ENCRYPTION_LABELS) as EmailEncryption[];

export interface EmailForm {
  senderName: string;
  senderEmail: string;
  replyTo: string;
  host: string;
  /** Kept as a string so the field can be cleared while typing. */
  port: string;
  encryption: EmailEncryption;
  username: string;
  password: string;
  enabled: boolean;
}

interface EmailServerFormProps {
  form: EmailForm;
  settings: EmailSettings | null;
  saving: boolean;
  onChange: (form: EmailForm) => void;
  onSave: () => void;
}

/** The server and sender fields. The password box is write-only, by design. */
export function EmailServerForm({
  form,
  settings,
  saving,
  onChange,
  onSave,
}: EmailServerFormProps) {
  const set = (patch: Partial<EmailForm>) => onChange({ ...form, ...patch });
  const valid =
    form.senderEmail.includes('@') && form.host.trim().length > 0 && Number(form.port) > 0;

  return (
    <>
      <Card title="Server">
        <FormGrid>
          <FormField label="Server" required>
            <Input
              value={form.host}
              placeholder="smtp.example.com"
              onChange={(event) => set({ host: event.target.value })}
            />
          </FormField>
          <FormField label="Port" required>
            <Input
              type="number"
              value={form.port}
              onChange={(event) => set({ port: event.target.value })}
            />
          </FormField>
          <FormField label="Encryption" required>
            <Select
              value={form.encryption}
              onChange={(event) => set({ encryption: event.target.value as EmailEncryption })}
              options={ENCRYPTIONS.map((value) => ({
                value,
                label: EMAIL_ENCRYPTION_LABELS[value],
              }))}
            />
          </FormField>
          <FormField label="Username">
            <Input
              value={form.username}
              autoComplete="off"
              onChange={(event) => set({ username: event.target.value })}
            />
          </FormField>
          <FormField
            label="Password"
            hint={
              settings?.hasPassword
                ? 'A password is stored. Leave blank to keep it.'
                : 'Stored encrypted and never shown again.'
            }
          >
            <Input
              type="password"
              value={form.password}
              autoComplete="new-password"
              placeholder={settings?.hasPassword ? '••••••••' : ''}
              onChange={(event) => set({ password: event.target.value })}
            />
          </FormField>
        </FormGrid>
      </Card>

      <Card title="Sender">
        <FormGrid>
          <FormField label="Sender name" required>
            <Input
              value={form.senderName}
              placeholder="Ashniva Desk"
              onChange={(event) => set({ senderName: event.target.value })}
            />
          </FormField>
          <FormField label="Sender address" required>
            <Input
              type="email"
              value={form.senderEmail}
              placeholder="noreply@example.com"
              onChange={(event) => set({ senderEmail: event.target.value })}
            />
          </FormField>
          <FormField label="Reply-to" hint="Where a reply should go, if not the sender address">
            <Input
              type="email"
              value={form.replyTo}
              onChange={(event) => set({ replyTo: event.target.value })}
            />
          </FormField>
          <Switch
            label="Send email"
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
            disabledReason="A server, port and sender address are required"
            onClick={onSave}
          >
            Save settings
          </Button>
        </div>
      </Card>
    </>
  );
}
