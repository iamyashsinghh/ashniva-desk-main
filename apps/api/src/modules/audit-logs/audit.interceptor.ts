import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { RequestWithUser } from '../../common/decorators/current-user.decorator';
import { AuditLogService } from './audit-log.service';
import { AUDITED_KEY, type AuditedOptions } from './audited.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    return next.handle().pipe(
      tap((result: unknown) => {
        void this.auditLog.record({
          action: options.action,
          entityType: options.entityType,
          entityId: this.resolveEntityId(request, result, options),
          after: result,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }),
    );
  }

  private resolveEntityId(
    request: RequestWithUser,
    result: unknown,
    options: AuditedOptions,
  ): string | undefined {
    const paramName = options.entityIdParam ?? 'id';
    const fromParams = (request.params as Record<string, string | undefined>)[paramName];
    if (fromParams) {
      return fromParams;
    }
    if (typeof result === 'object' && result !== null && 'id' in result) {
      const id = (result as { id: unknown }).id;
      return typeof id === 'string' ? id : undefined;
    }
    return undefined;
  }
}
