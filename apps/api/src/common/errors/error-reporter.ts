import { Injectable } from '@nestjs/common';

/** What an error backend is told about an unhandled failure. */
export interface ErrorReport {
  /** The thrown value, whatever it was. */
  error: unknown;
  /** Correlates the report with the log line and with what the caller was shown. */
  requestId?: string;
  /**
   * The matched route *pattern* — `/api/v1/tickets/:id` — never the resolved URL.
   *
   * A report leaves the process, so this field has to be safe outside it. The URL is not: the
   * query string carries `hub.verify_token` on the WhatsApp webhook, and the path itself carries a
   * live single-use invitation token on `/auth/invitations/:token`. The pattern names the endpoint
   * and nothing about the request; `requestId` joins the report to the log line, which is
   * first-party and does hold the URL.
   */
  path?: string;
  /** HTTP method, when the failure came from a request. */
  method?: string;
  /** The signed-in user, when there was one. Never their email or name. */
  userId?: string;
  /** The tenant, when the request had one. */
  organizationId?: string;
}

/**
 * Where unhandled errors go besides the log.
 *
 * The interface exists so that adopting Sentry, Bugsnag, GlitchTip or an internal collector is a
 * provider swap in one module rather than a change to the exception filter — which is the file
 * you least want to be editing under pressure. The filter already holds everything such a backend
 * wants (the exception, the request id, the path); all that was missing was somewhere to send it.
 *
 * Deliberately not an event, a queue or an interceptor chain. One method, called from one place.
 */
export abstract class ErrorReporter {
  abstract report(report: ErrorReport): void;
}

/**
 * The default: does nothing.
 *
 * A no-op rather than an optional dependency, so the filter has no branch and every call site
 * looks the same whether or not a backend is configured. Errors are still logged either way — the
 * log is the record; this is the alerting seam.
 */
@Injectable()
export class NoopErrorReporter extends ErrorReporter {
  report(): void {
    // Intentionally empty. Replace the ErrorReporter provider to send reports somewhere.
  }
}
