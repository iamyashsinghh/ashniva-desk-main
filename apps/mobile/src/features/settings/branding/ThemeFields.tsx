import { DEFAULT_THEME_DOCUMENT, type ResolvedThemeDocument } from '@ashniva/types';
import { View } from 'react-native';

import { Field, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

export type ColorKey = keyof ResolvedThemeDocument['colors'];

/**
 * The colours an administrator may set — the web's subset. The rest of the family is settable
 * through the API, but the border shades and faint text are far easier to make illegible than to
 * improve.
 */
const COLOR_FIELDS: { key: ColorKey; label: string; hint?: string }[] = [
  { key: 'brandPrimary', label: 'Primary', hint: 'Buttons, links and the active nav item' },
  { key: 'brandSecondary', label: 'Secondary', hint: 'Headings and the logo mark' },
  { key: 'brandAccent', label: 'Accent', hint: 'Success and positive emphasis' },
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Card surface' },
  { key: 'text', label: 'Body text' },
  { key: 'textOnBrand', label: 'Text on brand', hint: 'Must stay readable on the primary colour' },
  { key: 'danger', label: 'Danger' },
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Colour tokens as hex text with a live swatch beside each.
 *
 * The text is not validated here, as on the web — the API validates every token against its own
 * kind — but the swatch only paints a value that is a hex colour, so a half-typed one shows an
 * empty frame rather than whatever React Native makes of it.
 */
export function ColorFields({
  colors,
  onChange,
}: {
  colors: ResolvedThemeDocument['colors'];
  onChange: (key: ColorKey, value: string) => void;
}) {
  const theme = useTheme();
  return (
    <>
      {COLOR_FIELDS.map((field) => {
        const value = colors[field.key];
        return (
          <Field key={field.key} label={field.label} {...(field.hint ? { hint: field.hint } : {})}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
              <View
                accessibilityLabel={`${field.label} swatch`}
                style={{
                  backgroundColor: HEX.test(value) ? value : 'transparent',
                  borderColor: theme.colors.borderStrong,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  height: 36,
                  width: 36,
                }}
              />
              <View style={{ flex: 1 }}>
                <Input
                  accessibilityLabel={`${field.label} colour`}
                  value={value}
                  onChangeText={(text) => onChange(field.key, text)}
                  placeholder={DEFAULT_THEME_DOCUMENT.colors[field.key]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </Field>
        );
      })}
    </>
  );
}

export type ShapeChange =
  | { family: 'radius'; key: 'md' | 'lg'; value: string }
  | { family: 'typography'; key: 'sizeMd' | 'fontSans'; value: string }
  | { family: 'spacing'; key: 'space4'; value: string };

/** The non-colour tokens worth judging by eye: radii, base text size and font, base spacing. */
export function ShapeFields({
  theme: document,
  onChange,
}: {
  theme: ResolvedThemeDocument;
  onChange: (change: ShapeChange) => void;
}) {
  const tokens: {
    label: string;
    hint?: string;
    value: string;
    placeholder: string;
    change: (value: string) => ShapeChange;
  }[] = [
    {
      label: 'Corner radius',
      hint: 'Cards, inputs and buttons',
      value: document.radius.md,
      placeholder: DEFAULT_THEME_DOCUMENT.radius.md,
      change: (value) => ({ family: 'radius', key: 'md', value }),
    },
    {
      label: 'Large radius',
      value: document.radius.lg,
      placeholder: DEFAULT_THEME_DOCUMENT.radius.lg,
      change: (value) => ({ family: 'radius', key: 'lg', value }),
    },
    {
      label: 'Base text size',
      hint: 'A length such as 13.5px',
      value: document.typography.sizeMd,
      placeholder: DEFAULT_THEME_DOCUMENT.typography.sizeMd,
      change: (value) => ({ family: 'typography', key: 'sizeMd', value }),
    },
    {
      label: 'Base spacing',
      value: document.spacing.space4,
      placeholder: DEFAULT_THEME_DOCUMENT.spacing.space4,
      change: (value) => ({ family: 'spacing', key: 'space4', value }),
    },
    {
      label: 'Font stack',
      hint: 'Families already available to the browser; a theme cannot fetch a web font',
      value: document.typography.fontSans,
      placeholder: DEFAULT_THEME_DOCUMENT.typography.fontSans,
      change: (value) => ({ family: 'typography', key: 'fontSans', value }),
    },
  ];
  return (
    <>
      {tokens.map((token) => (
        <Field key={token.label} label={token.label} {...(token.hint ? { hint: token.hint } : {})}>
          <Input
            accessibilityLabel={token.label}
            value={token.value}
            onChangeText={(text) => onChange(token.change(text))}
            placeholder={token.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
      ))}
    </>
  );
}
