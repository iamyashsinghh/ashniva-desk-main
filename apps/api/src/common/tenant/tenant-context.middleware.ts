import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { getRequestId } from '../../logging/request-id';
import { TenantContextService } from './tenant-context.service';

/** Opens one tenant-context store per HTTP request. Guards fill it in later. */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    this.tenantContext.run({ requestId: getRequestId(request) }, () => next());
  }
}
