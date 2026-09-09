import { randomUUID } from 'node:crypto';

import type { Request } from 'express';
import type { Options } from 'pino-http';

import { routePattern } from '../common/http/route-pattern';
import { REQUEST_ID_HEADER } from './request-id';

/** The subset of the configuration the logger needs, so the builder is testable on its own. */
export interface LoggingConfig {
  environment: string;
  logging: { level: string };
}

/**
 * What pino-http hands a request serializer.
 *
 * `serializers.req` is wrapped in `wrapRequestSerializer`, so ours is called with the *default*
 * serializer's output — id, method, url, query, params, headers — plus `raw`, the Express request
 * it was built from. We keep three of those fields and reach through `raw` for the route pattern.
 */
interface SerializedRequest {
  id?: unknown;
  method?: string;
  raw: Request;
}

/**
 * What the request log says about a request. Deliberately not "the URL".
 *
 * The resolved URL is where credentials live: `GET /api/v1/auth/invitations/:token` carries a
 * live, bearer-equivalent invitation token in the path (`POST /auth/invitations/accept` turns it
 * into a password and a session), and the WhatsApp handshake takes `hub.verify_token` in the
 * query string. `redact` cannot help — the secret is the value, not a named field — so an
 * `autoLogging` line built from `req.originalUrl` writes both of them to the log of every
 * deployment, in the clear, for as long as the log is kept.
 *
 * The route pattern is the same answer the metrics labels and the error reporter already use (see
 * `common/http/route-pattern.ts`): it has no parameters and no query at all, and it bounds log
 * cardinality to the number of routes rather than the number of tickets. Query string and headers
 * are dropped with it, so an `Idempotency-Key`, an `X-Reauth-Token` or a session token in a header
 * cannot arrive here either.
 *
 * Everything an incident needs is still on the line: the method and route here, the status code
 * and `responseTime` from pino-http itself, and the request id that the response echoed to the
 * caller in `X-Request-Id`.
 */
export function serializeRequest(request: SerializedRequest): {
  id: unknown;
  method: string | undefined;
  route: string;
} {
  return { id: request.id, method: request.method, route: routePattern(request.raw) };
}

/** pino-http options shared by the application and by the test that proves nothing leaks. */
export function buildPinoHttpOptions(config: LoggingConfig): Options {
  return {
    level: config.logging.level,
    genReqId: (request, response) => {
      const incoming = request.headers[REQUEST_ID_HEADER];
      const requestId =
        typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
      response.setHeader(REQUEST_ID_HEADER, requestId);
      return requestId;
    },
    serializers: { req: serializeRequest },
    // Never log credentials. The request serializer above already drops headers and the query
    // string; these paths stay as the second layer, for the day someone widens it again.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    autoLogging: {
      ignore: (request) => request.url?.startsWith('/api/v1/health') ?? false,
    },
    // Pretty output for developers only. Production emits JSON; tests skip the transport
    // because its worker thread would keep the test runner alive.
    transport:
      config.environment === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
        : undefined,
  };
}
