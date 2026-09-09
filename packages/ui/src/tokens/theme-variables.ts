import type { ResolvedThemeDocument } from '@ashniva/types';

/**
 * Which CSS custom properties a theme is allowed to set, and how a theme document maps onto them.
 *
 * The allow-list is the point of this file. Applying a theme means writing into the live
 * document's inline style, and a generic applier without a list would set whatever key it was
 * handed — so a malformed document, or a compromised Theme Manager, could introduce properties
 * that nothing in `tokens.css` declares and that no reviewer ever looked at. A property that is
 * not on this list is dropped, and dropping it is a normal outcome rather than an error: the page
 * keeps the value the stylesheet gave it.
 *
 * Note what is deliberately *absent*: the semantic tone pairs, the priority dots, the layout
 * measurements and the touch target. Those encode meaning (danger is red, a touch target is 44px)
 * rather than taste, and letting a published theme move them would let a theme make a
 * "cancelled" pill look like a "done" one.
 */

/** Every property a theme document can produce, plus the three shades derived from the brand. */
export const SETTABLE_CSS_PROPERTIES: ReadonlySet<string> = new Set([
  // Brand, and the shades derived from it rather than stated by the document.
  '--brand-primary',
  '--brand-primary-hover',
  '--brand-primary-soft',
  '--brand-secondary',
  '--brand-accent',
  '--brand-accent-hover',
  // Surfaces and text.
  '--color-bg',
  '--color-surface',
  '--color-surface-muted',
  '--color-border',
  '--color-border-subtle',
  '--color-border-strong',
  '--color-text',
  '--color-text-muted',
  '--color-text-faint',
  '--color-text-on-brand',
  '--color-danger',
  // Typography.
  '--font-sans',
  '--font-mono',
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-md',
  '--font-size-lg',
  '--font-size-xl',
  '--font-size-2xl',
  '--line-height',
  // Spacing.
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  // Shape and elevation.
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-pill',
  '--shadow-sm',
  '--shadow-md',
  // Focus ring.
  '--focus-ring',
]);

/**
 * Turns a resolved theme document into the CSS custom properties it stands for.
 *
 * Pure and total: it reads a document and returns a plain record, so what a theme *means* can be
 * tested without a DOM, and the applier that writes it stays a three-line loop with one rule.
 */
export function themeCssProperties(theme: ResolvedThemeDocument): Record<string, string> {
  const { colors, typography, spacing, radius, shadow, focus } = theme;
  return {
    '--brand-primary': colors.brandPrimary,
    '--brand-secondary': colors.brandSecondary,
    '--brand-accent': colors.brandAccent,
    '--color-bg': colors.background,
    '--color-surface': colors.surface,
    '--color-surface-muted': colors.surfaceMuted,
    '--color-border': colors.border,
    '--color-border-subtle': colors.borderSubtle,
    '--color-border-strong': colors.borderStrong,
    '--color-text': colors.text,
    '--color-text-muted': colors.textMuted,
    '--color-text-faint': colors.textFaint,
    '--color-text-on-brand': colors.textOnBrand,
    '--color-danger': colors.danger,
    '--font-sans': typography.fontSans,
    '--font-mono': typography.fontMono,
    '--font-size-xs': typography.sizeXs,
    '--font-size-sm': typography.sizeSm,
    '--font-size-md': typography.sizeMd,
    '--font-size-lg': typography.sizeLg,
    '--font-size-xl': typography.sizeXl,
    '--font-size-2xl': typography.size2xl,
    '--line-height': String(typography.lineHeight),
    '--space-1': spacing.space1,
    '--space-2': spacing.space2,
    '--space-3': spacing.space3,
    '--space-4': spacing.space4,
    '--space-5': spacing.space5,
    '--space-6': spacing.space6,
    '--space-8': spacing.space8,
    '--radius-sm': radius.sm,
    '--radius-md': radius.md,
    '--radius-lg': radius.lg,
    '--radius-pill': radius.pill,
    '--shadow-sm': shadow.sm,
    '--shadow-md': shadow.md,
    '--focus-ring': focus.ring,
  };
}
