import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@ashniva/types';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { getRequestId } from '../../logging/request-id';
import { MoneyInputError } from '../../modules/billing/money';
import { routePattern } from '../http/route-pattern';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ErrorReporter } from './error-reporter';
import { extractValidationDetails } from './validation-details';
import { mapPrismaError } from './prisma-error.mapper';

/**
 * Central error handler. Every error leaves the API in the ApiErrorResponse shape from
 * packages/types. Unexpected errors are logged with the request id and returned as a generic 500
 * so internal details never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    private readonly reporter: ErrorReporter,
    private readonly tenantContext: TenantContextService,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);

    const body = this.toErrorResponse(exception, request, requestId);

    if (body.statusCode >= 500) {
      // The pattern here too. A 500 out of `GET /auth/invitations/:token` would otherwise write a
      // live invitation token to the log, which is the one place the reasoning below used to say
      // it was safe to keep the full URL. It is not: a log is read by more people, kept longer and
      // shipped further than the process that made it. The caller still gets `path` in the error
      // body — they sent the URL — and the request id joins the two.
      this.logger.error(
        { err: exception, requestId, path: routePattern(request), method: request.method },
        'Unhandled error',
      );
      // Only 5xx. A 400 or a 403 is the API working, and a backend that pages somebody for every
      // rejected form is a backend somebody turns off.
      const tenant = this.tenantContext.get();
      this.reporter.report({
        error: exception,
        requestId,
        // The pattern, not `request.url`. The URL carries path parameters and a query string, and
        // both hold secrets on real routes here — `/auth/invitations/:token` is a live single-use
        // invitation token, the WhatsApp webhook takes `hub.verify_token` as a query parameter.
        // An error backend is somewhere else, so what it is told has to be safe to be there. The
        // request id joins the report back to the log line, which reports the same pattern.
        path: routePattern(request),
        method: request.method,
        ...(tenant?.userId ? { userId: tenant.userId } : {}),
        ...(tenant?.organizationId ? { organizationId: tenant.organizationId } : {}),
      });
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(
    exception: unknown,
    request: Request,
    requestId: string | undefined,
  ): ApiErrorResponse {
    const base = {
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const details = extractValidationDetails(payload);
      return {
        ...base,
        statusCode: status,
        error: toReasonPhrase(status),
        message: details ? 'Validation failed' : exception.message,
        details,
      };
    }

    // A figure the caller sent that a money column will not hold. It is a bad field, not a
    // failure of ours, so it gets a 400 with the reason rather than "something went wrong".
    if (exception instanceof MoneyInputError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        error: toReasonPhrase(HttpStatus.BAD_REQUEST),
        message: exception.message,
      };
    }

    const prismaError = mapPrismaError(exception);
    if (prismaError) {
      return { ...base, ...prismaError };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: toReasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Something went wrong. Please try again or contact support with the request id.',
    };
  }
}

/** 404 → "Not Found", 500 → "Internal Server Error", … using the HttpStatus enum names. */
export function toReasonPhrase(status: number): string {
  const enumName = HttpStatus[status];
  if (typeof enumName !== 'string') {
    return 'Error';
  }
  return enumName
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
