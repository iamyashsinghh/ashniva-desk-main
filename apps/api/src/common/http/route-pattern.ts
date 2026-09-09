import type { Request } from 'express';

/**
 * The route *pattern* a request matched — `/api/v1/tickets/:id`, never `/api/v1/tickets/9f2c…`.
 *
 * Two callers, for two reasons that happen to want the same string.
 *
 * Metrics: a resolved URL as a label gives the monitoring system one time series per ticket, which
 * is how a metrics endpoint becomes the most expensive thing in a deployment.
 *
 * Error reports: the resolved URL is where secrets live. `GET /api/v1/auth/invitations/:token`
 * carries a live single-use invitation token *in the path*, and the WhatsApp webhook takes
 * `hub.verify_token` in the query string, so neither "the URL" nor "the URL without its query" is
 * safe to hand to an external error backend. The pattern has no parameters and no query at all.
 *
 * Express fills `req.route` once it has matched, so by the time a response finishes — or an
 * exception filter runs, which is inside the matched handler — this is the pattern. A request that
 * matched nothing has no pattern to report and is grouped under one bucket rather than by its URL,
 * which is both the low-cardinality answer and the non-leaking one.
 */
export function routePattern(request: Request): string {
  const route = (request as Request & { route?: { path?: string } }).route?.path;
  if (!route) {
    return 'unmatched';
  }
  return `${request.baseUrl}${route}`.replace(/\/$/, '') || '/';
}
