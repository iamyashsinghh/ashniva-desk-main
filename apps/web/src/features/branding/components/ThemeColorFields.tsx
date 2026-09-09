import { DEFAULT_THEME_DOCUMENT, type ResolvedThemeDocument } from '@ashniva/types';

type ColorKey = keyof ResolvedThemeDocument['colors'];

/**
 * Which colours an administrator may set, and what to call them.
 *
 * A subset of the document's colour family on purpose. The whole family is settable through the
 * API, but a form with fourteen colour pickers is a form nobody finishes correctly — and the ones
 * left out (the border shades, the faint text) are derived-looking values that are far easier to
 * make illegible than to improve.
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

interface ThemeColorFieldsProps {
  colors: ResolvedThemeDocument['colors'];
  onChange: (key: ColorKey, value: string) => void;
}

/**
 * A colour swatch and its hex value side by side.
 *
 * Both, not one: the picker is how somebody chooses a colour and the text box is how they paste
 * the one from a brand guideline. The text box is not validated here — the API validates every
 * token against its own kind, and a second, laxer rule in the browser is exactly the sort of
 * drift that turns a validated field into an unvalidated one.
 */
export function ThemeColorFields({ colors, onChange }: ThemeColorFieldsProps) {
  return (
    <div className="branding-tokens">
      {COLOR_FIELDS.map((field) => (
        <div className="branding-token" key={field.key}>
          <label htmlFor={`color-${field.key}`}>
            {field.label}
            {field.hint ? <div className="muted">{field.hint}</div> : null}
          </label>
          <input
            type="color"
            aria-label={`${field.label} colour picker`}
            value={colors[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
          <input
            className="ui-control"
            type="text"
            id={`color-${field.key}`}
            spellCheck={false}
            value={colors[field.key]}
            placeholder={DEFAULT_THEME_DOCUMENT.colors[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
