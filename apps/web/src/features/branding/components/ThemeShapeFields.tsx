import { DEFAULT_THEME_DOCUMENT, type ResolvedThemeDocument } from '@ashniva/types';

type ShapeChange =
  | { family: 'radius'; key: keyof ResolvedThemeDocument['radius']; value: string }
  | { family: 'typography'; key: 'sizeMd' | 'fontSans'; value: string }
  | { family: 'spacing'; key: 'space4'; value: string };

interface ThemeShapeFieldsProps {
  theme: ResolvedThemeDocument;
  onChange: (change: ShapeChange) => void;
}

/**
 * The non-colour tokens worth exposing on a form: corner radii, the base text size and font, and
 * the base spacing step.
 *
 * A deliberately small selection of a much larger document. Every token is settable through the
 * API — a design system's own tooling should be able to publish all of them — but the ones here
 * are the ones an administrator can reasonably judge by looking at the result. The rest are best
 * changed together, which is what a Theme Manager is for.
 */
export function ThemeShapeFields({ theme, onChange }: ThemeShapeFieldsProps) {
  return (
    <div className="branding-tokens">
      <TextToken
        id="radius-md"
        label="Corner radius"
        hint="Cards, inputs and buttons"
        value={theme.radius.md}
        placeholder={DEFAULT_THEME_DOCUMENT.radius.md}
        onChange={(value) => onChange({ family: 'radius', key: 'md', value })}
      />
      <TextToken
        id="radius-lg"
        label="Large radius"
        value={theme.radius.lg}
        placeholder={DEFAULT_THEME_DOCUMENT.radius.lg}
        onChange={(value) => onChange({ family: 'radius', key: 'lg', value })}
      />
      <TextToken
        id="size-md"
        label="Base text size"
        hint="A length such as 13.5px"
        value={theme.typography.sizeMd}
        placeholder={DEFAULT_THEME_DOCUMENT.typography.sizeMd}
        onChange={(value) => onChange({ family: 'typography', key: 'sizeMd', value })}
      />
      <TextToken
        id="space-4"
        label="Base spacing"
        value={theme.spacing.space4}
        placeholder={DEFAULT_THEME_DOCUMENT.spacing.space4}
        onChange={(value) => onChange({ family: 'spacing', key: 'space4', value })}
      />
      <TextToken
        id="font-sans"
        wide
        label="Font stack"
        hint="Families already available to the browser; a theme cannot fetch a web font"
        value={theme.typography.fontSans}
        placeholder={DEFAULT_THEME_DOCUMENT.typography.fontSans}
        onChange={(value) => onChange({ family: 'typography', key: 'fontSans', value })}
      />
    </div>
  );
}

function TextToken({
  id,
  label,
  hint,
  value,
  placeholder,
  wide = false,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={wide ? 'branding-token branding-token--wide' : 'branding-token'}>
      <label htmlFor={id}>
        {label}
        {hint ? <div className="muted">{hint}</div> : null}
      </label>
      <input
        className="ui-control"
        type="text"
        id={id}
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
