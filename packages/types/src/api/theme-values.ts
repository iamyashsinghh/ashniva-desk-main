import { z } from 'zod';

/**
 * The kinds of value a theme token may hold.
 *
 * **This is the security boundary of the whole theming feature.** Every value validated here ends
 * up on the right-hand side of a CSS custom property, written with `setProperty` into the live
 * document. A custom property whose value is a free string is an injection point: `red; }
 * html { background: url(…)` closes the declaration a browser is happy to reopen, and a value
 * carrying `url(...)` makes the page fetch from wherever the theme says. So nothing is ever
 * validated as "a string" — each token is checked against the grammar of its own kind, and the
 * grammars below admit no parenthesis, semicolon, brace, backslash or comment marker except the
 * `rgba(...)` that a shadow genuinely needs, and that only in a fully-pinned shape.
 *
 * The lengths are capped as tightly as the values they describe, for the same reason: a cap of
 * 4096 on a colour is not validation, it is a bigger hole.
 */

/** `#rrggbb`. The same rule Desk has always applied to a brand colour — no shorthand, no alpha. */
export const themeColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb colour');

/**
 * A CSS length: a bounded number and one of three units.
 *
 * No `calc()`, no `var()`, no bare unitless number. A unitless length is not a CSS length, and
 * accepting one would mean accepting `0` today and an arbitrary token tomorrow.
 */
export const themeLengthSchema = z
  .string()
  .max(12)
  .regex(
    /^(0|[1-9][0-9]{0,3})(\.[0-9]{1,3})?(px|rem|em)$/,
    'Expected a length such as 12px or 1rem',
  );

/**
 * A unitless ratio, for line height.
 *
 * A number rather than a string: there is nothing to escape in a number, so the whole class of
 * injection disappears rather than being filtered out.
 */
export const themeRatioSchema = z.number().min(0.5).max(4);

/**
 * A single shadow layer, `<x> <y> <blur> [spread] rgba(r, g, b, a)`, or `none`.
 *
 * Deliberately one layer and one colour function. Real CSS shadows can be comma-separated lists
 * with insets and any colour syntax; admitting all of that means admitting nested parentheses,
 * and a validator for nested parentheses in a regular expression is how these things go wrong.
 * One layer covers every shadow in `tokens.css` — including the focus ring, which is a shadow
 * with a spread — and a design that needs two layers is a schema change with a version bump, not
 * a looser rule.
 */
export const themeShadowSchema = z
  .string()
  .max(64)
  .regex(
    /^(none|-?(0|[1-9][0-9]{0,2})(px)? -?(0|[1-9][0-9]{0,2})(px)? (0|[1-9][0-9]{0,2})(px)?( (0|[1-9][0-9]{0,2})(px)?)? rgba\((0|[1-9][0-9]{0,2}), ?(0|[1-9][0-9]{0,2}), ?(0|[1-9][0-9]{0,2}), ?(0|1|0?\.[0-9]{1,3})\))$/,
    'Expected a shadow such as 0 1px 2px rgba(0, 0, 0, 0.06)',
  );

/** The only hosts for which plain HTTP is not a downgrade, because there is no network in between. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * A URL a browser will be asked to load a logo from.
 *
 * `new URL()` alone is not a check: it parses `javascript:alert(1)` happily, and a stored URL
 * that reaches an `href` or a stylesheet later is then a script. So the scheme is checked rather
 * than assumed, and the length is bounded like everything else here.
 *
 * **Plain HTTP is admitted only for loopback**, the same rule and the same reasoning the support
 * widget applies to a registered origin. This value becomes the `src` of an image on the sign-in
 * page: on an HTTPS deployment an `http:` logo is mixed content a browser blocks outright, and
 * anywhere else it is a picture that any network between the two can substitute — on the one page
 * whose entire job is to look like the customer's own product. Loopback is the exception because
 * there is no network to intercept, and it is where a developer runs the thing they are styling.
 */
export const themeUrlSchema = z
  .string()
  .max(500)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol === 'https:') {
      return true;
    }
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  }, 'Expected an https URL, or an http URL on loopback');

/**
 * A font-family stack.
 *
 * Letters, digits, spaces, hyphens, dots, commas and the quotes a family name with a space needs.
 * No `url(`, so a theme cannot make the browser fetch a font from an address the theme chose, and
 * no way out of the declaration. A web font is a deliberate deployment decision, not something a
 * published theme document should be able to introduce.
 */
export const themeFontStackSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(
    /^[A-Za-z0-9 '"\-,.]+$/,
    "Expected a font stack such as 'IBM Plex Sans', Arial, sans-serif",
  );

/** Product-level text, which is rendered as text and never as CSS, but is still bounded. */
export const themeLabelSchema = z.string().min(1).max(60);
