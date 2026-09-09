import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REAUTH_HEADER } from '@ashniva/types';

import type { RequestWithUser } from '../../../common/decorators/current-user.decorator';
import {
  REAUTH_REQUIRED_MESSAGE,
  REQUIRE_RECENT_AUTH_KEY,
} from '../../../common/decorators/require-recent-auth.decorator';
import { ReauthService } from '../reauth.service';

/** Enforces @RequireRecentAuth(): runs after JwtAuthGuard, so request.user is present. */
@Injectable()
export class RecentAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly reauth: ReauthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRE_RECENT_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const header = request.headers[REAUTH_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!user || !token || !(await this.reauth.verify(token, user.userId, user.organizationId))) {
      throw new ForbiddenException(REAUTH_REQUIRED_MESSAGE);
    }
    return true;
  }
}
