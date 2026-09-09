import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

import type { WidgetOriginRegistry } from './modules/products/widget-origin.registry';
import { widgetAwareCors } from './widget-cors';

/**
 * Which of the two CORS rulesets a request gets, decided on the request line alone.
 *
 * The delegate runs as app-level Express middleware, where `request.url` is the path *and* the
 * query string and nothing has been routed yet. That makes "is this a widget route" a string
 * question, and a string question answered with an unanchored pattern is a CORS bypass: a query
 * parameter is caller-controlled, so `?ref=/support/widget` on any other route would otherwise pick
 * the ruleset that reflects every origin any tenant has registered.
 *
 * These tests are about that decision only. What the registry considers registered is
 * `widget-origin.registry.ts`'s business, and the wire behaviour is asserted end to end in
 * `support-platform.e2e-spec.ts`.
 */

const FIRST_PARTY = ['https://desk.ashniva.example'];
const WIDGET_ORIGIN = 'https://app.carelix.example';

function registryAllowing(...origins: string[]): WidgetOriginRegistry {
  return {
    isRegistered: (origin?: string) => Promise.resolve(Boolean(origin && origins.includes(origin))),
  } as unknown as WidgetOriginRegistry;
}

/** The delegate's answer for one request line, plus what it did to the response headers. */
async function decide(
  url: string,
  origin: string | undefined,
  registry = registryAllowing(WIDGET_ORIGIN),
): Promise<{ options: CorsOptions; varied: string[] }> {
  const varied: string[] = [];
  const request = {
    url,
    headers: origin ? { origin } : {},
    res: { vary: (field: string) => varied.push(field) },
  } as unknown as Request;

  const delegate = widgetAwareCors(registry, FIRST_PARTY);
  const options = await new Promise<CorsOptions>((resolve, reject) => {
    delegate(request, (error, result) => (error ? reject(error) : resolve(result)));
  });
  return { options, varied };
}

describe('widgetAwareCors — which ruleset a route gets', () => {
  it('gives the widget ruleset to a widget route', async () => {
    const { options } = await decide('/api/v1/support/widget/config', WIDGET_ORIGIN);
    expect(options.origin).toBe(WIDGET_ORIGIN);
    // Reflected without credentials, which is the whole reason the two rulesets stay separate.
    expect(options.credentials).toBe(false);
  });

  it('gives the widget ruleset to a widget route carrying a query string', async () => {
    const { options } = await decide('/api/v1/support/widget/tickets?since=1', WIDGET_ORIGIN);
    expect(options.origin).toBe(WIDGET_ORIGIN);
  });

  it('refuses an origin no tenant has registered, on a genuine widget route', async () => {
    const { options } = await decide('/api/v1/support/widget/config', 'https://evil.example.com');
    expect(options.origin).toBe(false);
  });

  /**
   * The bypass this pattern exists to refuse.
   *
   * A widget origin belongs to whichever customer registered it, and any of them may put any
   * string in a query parameter. Matching on the path only is what keeps `/api/v1/tickets` on the
   * first-party allow-list where it belongs.
   */
  it('does not let a query string smuggle an arbitrary route into the widget ruleset', async () => {
    const { options } = await decide('/api/v1/tickets?ref=/support/widget', WIDGET_ORIGIN);
    expect(options.origin).toEqual(FIRST_PARTY);
    expect(options.credentials).toBe(true);
  });

  it.each([
    '/api/v1/tickets?next=/support/widget/config',
    '/api/v1/products?q=/support/widget',
    '/api/v1/support/widget-sessions',
    '/support/widget/config',
    '/api/v1/notsupport/widget/config',
  ])('keeps %s on the first-party rules', async (url) => {
    const { options } = await decide(url, WIDGET_ORIGIN);
    expect(options.origin).toEqual(FIRST_PARTY);
    expect(options.credentials).toBe(true);
  });

  /**
   * A first-party request whose query happens to contain the substring must not quietly lose
   * `credentials: true` — the failure would look like a broken session, not like a CORS rule.
   */
  it('keeps credentials for a first-party route that merely mentions the widget path', async () => {
    const { options } = await decide(
      '/api/v1/tickets?search=/support/widget',
      FIRST_PARTY[0],
      registryAllowing(),
    );
    expect(options.credentials).toBe(true);
  });
});

describe('widgetAwareCors — Vary', () => {
  it('varies on Origin when the origin is allowed', async () => {
    const { varied } = await decide('/api/v1/support/widget/config', WIDGET_ORIGIN);
    expect(varied).toContain('Origin');
  });

  /**
   * The refusal is the case that matters. With `origin: false` the `cors` package writes no
   * headers at all, so without this a shared cache could store the header-less response and hand
   * it to a registered origin — the one browser that would then believe it had been allowed.
   */
  it('varies on Origin when the origin is refused', async () => {
    const { varied } = await decide('/api/v1/support/widget/config', 'https://evil.example.com');
    expect(varied).toContain('Origin');
  });

  it('varies on Origin even when the registry cannot answer', async () => {
    const failing = {
      isRegistered: () => Promise.reject(new Error('database is down')),
    } as unknown as WidgetOriginRegistry;
    const { options, varied } = await decide(
      '/api/v1/support/widget/config',
      WIDGET_ORIGIN,
      failing,
    );
    expect(options.origin).toBe(false);
    expect(varied).toContain('Origin');
  });
});
