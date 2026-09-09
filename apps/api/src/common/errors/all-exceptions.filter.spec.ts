import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AllExceptionsFilter, toReasonPhrase } from './all-exceptions.filter';
import type { ErrorReport, ErrorReporter } from './error-reporter';

describe('toReasonPhrase', () => {
  it('turns HttpStatus enum names into reason phrases', () => {
    expect(toReasonPhrase(404)).toBe('Not Found');
    expect(toReasonPhrase(500)).toBe('Internal Server Error');
    expect(toReasonPhrase(422)).toBe('Unprocessable Entity');
  });

  it('falls back for unknown codes', () => {
    expect(toReasonPhrase(299)).toBe('Error');
  });
});

/** A request as Express hands it to the filter: matched, so `route` is filled in. */
function requestWith(options: { url: string; route?: string; baseUrl?: string }): Request {
  return {
    method: 'GET',
    url: options.url,
    baseUrl: options.baseUrl ?? '',
    headers: {},
    ...(options.route ? { route: { path: options.route } } : {}),
  } as unknown as Request;
}

function filterOver(
  reports: ErrorReport[],
  logged: unknown[] = [],
): {
  filter: AllExceptionsFilter;
  hostFor: (request: Request) => ArgumentsHost;
  body: () => unknown;
} {
  const silentLogger = {
    setContext: () => {},
    error: (payload: unknown) => {
      logged.push(payload);
    },
  } as never;
  const reporter: ErrorReporter = {
    report: (report: ErrorReport) => {
      reports.push(report);
    },
  };
  const tenantContext = { get: () => undefined } as never;

  let sent: unknown;
  const response = {
    status: () => response,
    json: (payload: unknown) => {
      sent = payload;
      return response;
    },
  } as unknown as Response;

  return {
    filter: new AllExceptionsFilter(silentLogger, reporter, tenantContext),
    hostFor: (request: Request): ArgumentsHost =>
      ({
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      }) as unknown as ArgumentsHost,
    body: () => sent,
  };
}

describe('what an unhandled error reports', () => {
  it('sends the route pattern, so a path parameter cannot carry a token out of the process', () => {
    // The live case. `/api/v1/auth/invitations/:token` is a single-use invitation token in the
    // path, and the WhatsApp webhook takes `hub.verify_token` in the query — so `request.url` is
    // exactly the wrong thing to hand to an error backend. The reporter is a no-op today; this is
    // the contract a Sentry provider would be written against.
    const reports: ErrorReport[] = [];
    const { filter, hostFor } = filterOver(reports);

    filter.catch(
      new Error('boom'),
      hostFor(
        requestWith({
          url: '/api/v1/auth/invitations/8f14e45f-ea8d-4f5a-9b21-000000000000?next=%2Fhome',
          route: '/api/v1/auth/invitations/:token',
        }),
      ),
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.path).toBe('/api/v1/auth/invitations/:token');
    expect(reports[0]?.path).not.toContain('8f14e45f');
    expect(reports[0]?.path).not.toContain('next=');
  });

  /**
   * The same fact about the log, which is the copy that actually gets written today: the error
   * reporter is a no-op, `logger.error` is not. A log is read by more people, kept longer and
   * shipped further than the process that made it, so a live invitation token has no business
   * in one.
   */
  it('logs the route pattern too, so the token is not in the log either', () => {
    const logged: unknown[] = [];
    const { filter, hostFor } = filterOver([], logged);

    filter.catch(
      new Error('boom'),
      hostFor(
        requestWith({
          url: '/api/v1/auth/invitations/8f14e45f-ea8d-4f5a-9b21-000000000000?next=%2Fhome',
          route: '/api/v1/auth/invitations/:token',
        }),
      ),
    );

    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0])).not.toContain('8f14e45f');
    expect(logged[0]).toMatchObject({ path: '/api/v1/auth/invitations/:token', method: 'GET' });
  });

  it('reports one bucket for a request that matched no route', () => {
    const reports: ErrorReport[] = [];
    const { filter, hostFor } = filterOver(reports);

    filter.catch(new Error('boom'), hostFor(requestWith({ url: '/api/v1/nope?secret=abc' })));

    expect(reports[0]?.path).toBe('unmatched');
  });

  it('does not report a 4xx, which is the API working', () => {
    const reports: ErrorReport[] = [];
    const { filter, hostFor } = filterOver(reports);

    filter.catch(
      new NotFoundException('Ticket not found'),
      hostFor(requestWith({ url: '/api/v1/tickets/1', route: '/api/v1/tickets/:id' })),
    );

    expect(reports).toHaveLength(0);
  });

  it('still tells the caller the URL they asked for', () => {
    // The response body goes back to whoever made the request, so it may name their own URL.
    const reports: ErrorReport[] = [];
    const { filter, hostFor, body } = filterOver(reports);

    filter.catch(
      new Error('boom'),
      hostFor(requestWith({ url: '/api/v1/tickets/1?q=2', route: '/api/v1/tickets/:id' })),
    );

    expect(body()).toMatchObject({ statusCode: 500, path: '/api/v1/tickets/1?q=2' });
  });
});
