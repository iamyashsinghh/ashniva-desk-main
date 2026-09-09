import { MESSAGE_TEMPLATE_LABELS, WHATSAPP_TEMPLATES, type MessageTemplate } from '@ashniva/types';
import { Card, FormField, FormGrid, Input } from '@ashniva/ui';
interface WhatsAppTemplateMapProps {
  templateNames: Partial<Record<MessageTemplate, string>>;
  onChange: (templateNames: Partial<Record<MessageTemplate, string>>) => void;
}

/**
 * Mapping our message types to templates approved in the WhatsApp Business account.
 *
 * Editable, unlike the email equivalent, because the names are chosen when the templates are
 * submitted to Meta for approval and only the account holder knows them. A type left blank
 * cannot be sent at all — the provider refuses it rather than falling back to free text, which
 * WhatsApp would not deliver anyway.
 */
export function WhatsAppTemplateMap({ templateNames, onChange }: WhatsAppTemplateMapProps) {
  const missing = WHATSAPP_TEMPLATES.filter((template) => !templateNames[template]);

  return (
    <Card title="Approved template names">
      <p className="muted">
        Enter the template name approved in your WhatsApp Business account for each message. A
        message with no name here is not sent.
      </p>
      <FormGrid>
        {WHATSAPP_TEMPLATES.map((template) => (
          <FormField key={template} label={MESSAGE_TEMPLATE_LABELS[template]}>
            <Input
              value={templateNames[template] ?? ''}
              placeholder={template.toLowerCase()}
              onChange={(event) =>
                onChange({ ...templateNames, [template]: event.target.value.trim() })
              }
            />
          </FormField>
        ))}
      </FormGrid>
      {missing.length > 0 ? (
        <p className="muted">
          {missing.length} of {WHATSAPP_TEMPLATES.length} not mapped yet, so those messages will not
          be sent on WhatsApp.
        </p>
      ) : null}
    </Card>
  );
}
