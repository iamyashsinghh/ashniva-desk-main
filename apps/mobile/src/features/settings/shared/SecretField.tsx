import { View } from 'react-native';

import { AppText, Field, Input, Pill } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * A stored secret — an SMTP password, an access token — as the web treats one: write-only.
 *
 * The API never returns the value, only whether one is stored, so the box is always empty and the
 * pill says "Stored" or "Not set". Typing replaces it on save; leaving it blank keeps what is
 * there. Nothing typed here is ever echoed back, which is why the input is a password field even
 * for values that are not passwords.
 */
export function SecretField({
  label,
  stored,
  value,
  onChange,
  editable,
  storedHint = 'Stored. Leave blank to keep it.',
  emptyHint = 'Stored encrypted and never shown again.',
}: {
  label: string;
  stored: boolean;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  storedHint?: string;
  emptyHint?: string;
}) {
  const theme = useTheme();
  return (
    <Field label={label} hint={stored ? storedHint : emptyHint}>
      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <Pill label={stored ? 'Stored' : 'Not set'} tone={stored ? 'success' : 'warning'} />
          {value ? (
            <AppText size="xs" tone="warning">
              Will be replaced on save
            </AppText>
          ) : null}
        </View>
        {editable ? (
          <Input
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            placeholder={stored ? 'Enter a new value to replace it' : 'Not set'}
          />
        ) : null}
      </View>
    </Field>
  );
}
