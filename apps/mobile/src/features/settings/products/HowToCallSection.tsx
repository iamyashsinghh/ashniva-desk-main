import { Platform, Text, View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

const RAISE_TICKET = `POST /api/v1/support/tickets
Authorization: Bearer ask_<keyId>.<secret>
Idempotency-Key: <your own unique id>

{
  "title": "Template sync is failing",
  "description": "Templates stopped syncing after the update.",
  "module": "API",
  "externalUserId": "your-user-id",
  "requesterEmail": "person@example.com",
  "externalReference": "YOUR-CASE-123"
}`;

const WIDGET_SESSION = `POST /api/v1/support/widget-sessions
Authorization: Bearer ask_<keyId>.<secret>

{ "externalUserId": "your-user-id", "origin": "https://app.example.com" }`;

function Code({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm + 2,
        padding: theme.spacing.md,
      }}
    >
      <Text
        selectable
        style={{ ...theme.typography.caption, color: theme.colors.text, fontFamily: MONOSPACE }}
      >
        {children}
      </Text>
    </View>
  );
}

/** The integration contract, for whoever is wiring the product up — the web's "How to call it". */
export function HowToCallSection() {
  return (
    <Section title="How to call it" icon="code-slash-outline" collapsible initiallyOpen={false}>
      <AppText size="sm" tone="muted">
        Every route below authenticates with a machine credential, not an employee token. The same
        contract serves an embedded support popup, a backend integration and a mobile support
        screen.
      </AppText>
      <Code>{RAISE_TICKET}</Code>
      <AppText size="sm" tone="muted">
        Retrying with the same Idempotency-Key returns the same ticket rather than raising another.
        GET /api/v1/support/tickets/:id reads back the status and public replies — never internal
        notes or who is working on it.
      </AppText>
      <AppText size="sm" tone="muted">
        For an embedded widget, keep the credential on your server and exchange it for a browser
        token — the ask_ secret must never reach page JavaScript.
      </AppText>
      <Code>{WIDGET_SESSION}</Code>
      <AppText size="sm" tone="muted">
        The askp_ token that comes back is bound to this product, that one person and that one
        origin, and expires in minutes. Register the origin in the settings above first.
      </AppText>
    </Section>
  );
}
