import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

import {
  WIDGET_ROUTE_PATTERN,
  type WidgetOriginRegistry,
} from './modules/products/widget-origin.registry';

/** Methods and headers the embedded widget actually uses. Nothing else is worth permitting. */
const WIDGET_METHODS = ['GET', 'POST', 'OPTIONS'];
const WIDGET_HEADERS = ['authorization', 'content-type', 'idempotency-key'];
const WIDGET_PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Cross-origin rules, decided per request rather than once at boot.
 *
 * Until now every browser call was same-origin: the web app is served through a dev proxy in
 * development and from the same host in production, which is why `apps/web/vite.config.ts` says no
 * CORS setup is needed. An embedded widget breaks that assumption — it runs on the customer's
 * site, which is by definition another origin, and the browser will refuse the call unless the API
 * says otherwise.
 *
 * Two rulesets, not one widened rule:
 *
 *  * **the widget routes** answer to any origin a tenant has registered against a live product,
 *    reflected back exactly and **without credentials**. Reflecting an origin *with* credentials
 *    would let every registered customer site make cookie-authenticated calls to the whole API,
 *    which is a much larger grant than "you may embed our support widget". The widget carries a
 *    bearer token and needs no cookie, so there is nothing to give up.
 *  * **everything else** keeps the first-party list from `CORS_ORIGINS`, with credentials, exactly
 *    as before.
 *
 * There is no wildcard on either path. `Access-Control-Allow-Origin: *` on the widget routes would
 * mean any page on the internet could call them; the token would still refuse to work from the
 * wrong origin, but the refusal would arrive after the request had been made rather than before.
 */
export function widgetAwareCors(
  origins: WidgetOriginRegistry,
  firstParty: readonly string[],
): (request: Request, callback: (error: Error | null, options: CorsOptions) => void) => void {
  const firstPartyOptions: CorsOptions = { origin: [...firstParty], credentials: true };

  return (request, callback) => {
    // `request.url` at this level is the path *and* the query string, so the query is dropped
    // before the route is decided. Without that, `?ref=/support/widget` on any other route would
    // choose the widget ruleset for it.
    if (!WIDGET_ROUTE_PATTERN.test(pathOf(request.url))) {
      callback(null, firstPartyOptions);
      return;
    }
    // Unconditional, and before the answer is known: on the refusal path `cors` writes no headers
    // at all, so a shared cache would be free to store an origin-less response and hand it to a
    // registered origin — which is the one browser that would then believe it was allowed.
    request.res?.vary('Origin');
    const origin = request.headers.origin;
    origins.isRegistered(origin).then(
      (allowed) => {
        callback(null, {
          // The literal origin, never a wildcard, and `false` when it is not registered — which
          // makes the `cors` package omit the header entirely and the browser block the call.
          origin: allowed && origin ? origin : false,
          credentials: false,
          methods: WIDGET_METHODS,
          allowedHeaders: WIDGET_HEADERS,
          maxAge: WIDGET_PREFLIGHT_MAX_AGE_SECONDS,
        });
      },
      // A database blip must not turn into a permissive answer. Refusing the origin is the safe
      // failure: the widget shows its offline state, which is what that state is for.
      () => callback(null, { origin: false, credentials: false }),
    );
  };
}

/** The path alone. A URL at this level has not been parsed yet and still carries its query. */
function pathOf(url: string): string {
  return url.split('?', 1)[0] ?? url;
}
