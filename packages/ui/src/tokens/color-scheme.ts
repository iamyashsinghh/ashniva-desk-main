/**
 * Light and dark, and the one attribute that decides which.
 *
 * `tokens.css` keys its dark palette on `data-theme="dark"` and on nothing else — no
 * `prefers-color-scheme` block — so that the dark palette is written once instead of twice in a
 * file where two copies would silently drift. The operating-system preference still works: it is
 * read here, in code that can be tested, and turned into the attribute.
 */

/** What a person chose. `system` defers to the operating system, and is the default. */
export type ColorSchemePreference = 'light' | 'dark' | 'system';

/** What the document is actually painted in once the preference has been resolved. */
export type ColorScheme = 'light' | 'dark';

/** The attribute `tokens.css` selects on. Exported so tests and the gallery cannot mistype it. */
export const COLOR_SCHEME_ATTRIBUTE = 'data-theme';

/**
 * Tokens whose value is a statement about the *scheme* rather than about the brand.
 *
 * These are the tokens `tokens.css` redefines under `[data-theme='dark']`, and therefore the
 * tokens the branding applier must not write while the page is dark. An element's inline style
 * beats every selector in every stylesheet, so writing a tenant's `--color-surface: #ffffff` onto
 * the root would paint white cards onto a dark page and no amount of CSS could undo it.
 *
 * A tenant's *brand* colours are not on this list and stay applied in both schemes: they are the
 * point of branding, and `--brand-primary-text` derives a readable version of them for dark.
 */
export const SCHEME_DEPENDENT_CSS_PROPERTIES: ReadonlySet<string> = new Set([
  '--color-bg',
  '--color-surface',
  '--color-surface-muted',
  '--color-border',
  '--color-border-subtle',
  '--color-border-strong',
  '--color-text',
  '--color-text-muted',
  '--color-text-faint',
  '--color-danger',
  '--brand-primary-soft',
  '--shadow-sm',
  '--shadow-md',
  '--focus-ring',
]);

/** Whether the operating system is asking for dark. Safe to call where `matchMedia` is absent. */
export function prefersDarkScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Turns a preference into the scheme to paint, consulting the OS only for `system`. */
export function resolveColorScheme(preference: ColorSchemePreference): ColorScheme {
  if (preference === 'system') {
    return prefersDarkScheme() ? 'dark' : 'light';
  }
  return preference;
}

/** The scheme an element is currently painted in, read back from the attribute. */
export function currentColorScheme(root: HTMLElement): ColorScheme {
  return root.getAttribute(COLOR_SCHEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light';
}

/**
 * Paints an element in a scheme, and clears any scheme-dependent token left inline by branding.
 *
 * The clearing is the part that is easy to forget and impossible to see: branding is applied once
 * at sign-in and the scheme can change afterwards, so switching to dark has to remove the light
 * surface colours that were written inline before anyone chose dark. Removing them, rather than
 * writing dark ones, is deliberate — it hands the tokens back to `tokens.css`, which is where the
 * dark palette actually lives.
 *
 * Because it *removes* rather than rewrites, a page that goes dark and then light again has lost
 * the tenant's inline surface colours and is showing the stylesheet's. Callers that can change
 * the scheme after branding has been applied should use `applyTheme`, which does both in the
 * order that leaves the document correct either way.
 *
 * Returns the scheme it settled on, so a caller can store it without resolving `system` twice.
 */
export function applyColorScheme(
  preference: ColorSchemePreference,
  root: HTMLElement = document.documentElement,
): ColorScheme {
  const scheme = resolveColorScheme(preference);
  root.setAttribute(COLOR_SCHEME_ATTRIBUTE, scheme);
  if (scheme === 'dark') {
    for (const property of SCHEME_DEPENDENT_CSS_PROPERTIES) {
      root.style.removeProperty(property);
    }
  }
  return scheme;
}
