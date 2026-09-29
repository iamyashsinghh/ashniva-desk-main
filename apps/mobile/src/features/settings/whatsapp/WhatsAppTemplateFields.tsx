import { MESSAGE_TEMPLATE_LABELS, WHATSAPP_TEMPLATES, type MessageTemplate } from '@ashniva/types';

import { Section } from '../../../shared/components/layout';
import { AppText, Field, Input } from '../../../shared/components/primitives';

/**
 * Our message types mapped to templates approved in the WhatsApp Business account. Editable,
 * unlike email's, because only the account holder knows the approved names; a type left blank is
 * not sent at all.
 */
export function WhatsAppTemplateFields({
  templateNames,
  editable,
  onChange,
}: {
  templateNames: Partial<Record<MessageTemplate, string>>;
  editable: boolean;
  onChange: (templateNames: Partial<Record<MessageTemplate, string>>) => void;
}) {
  const missing = WHATSAPP_TEMPLATES.filter((template) => !templateNames[template]).length;

  return (
    <Section
      title="Approved template names"
      icon="document-text-outline"
      collapsible
      initiallyOpen={missing > 0}
    >
      <AppText size="sm" tone="muted">
        Enter the template name approved in your WhatsApp Business account for each message. A
        message with no name here is not sent.
      </AppText>
      {WHATSAPP_TEMPLATES.map((template) => (
        <Field key={template} label={MESSAGE_TEMPLATE_LABELS[template]}>
          <Input
            accessibilityLabel={`${MESSAGE_TEMPLATE_LABELS[template]} template name`}
            value={templateNames[template] ?? ''}
            onChangeText={(text) => onChange({ ...templateNames, [template]: text.trim() })}
            placeholder={template.toLowerCase()}
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
      ))}
      {missing > 0 ? (
        <AppText size="xs" tone="warning">
          {missing} of {WHATSAPP_TEMPLATES.length} not mapped yet, so those messages will not be
          sent on WhatsApp.
        </AppText>
      ) : null}
    </Section>
  );
}
