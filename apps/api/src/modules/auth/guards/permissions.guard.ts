import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@ashniva/types';

import type { RequestWithUser } from '../../../common/decorators/current-user.decorator';
import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../../common/decorators/require-permissions.decorator';

/**
 * Checks @RequirePermissions() and @RequireAnyPermission() against the permissions loaded by
 * JwtAuthGuard. Routes without either decorator only require authentication.
 *
 * Both are checked when both are present, and both have to pass: a route that says "all of these,
 * and at least one of those" means exactly that.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const granted = context.switchToHttp().getRequest<RequestWithUser>().user?.permissions ?? [];

    const required = this.read(context, REQUIRED_PERMISSIONS_KEY);
    const missing = required.filter((permission) => !granted.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }

    // An extra requirement, never a replacement: a route saying "all of these, and at least one of
    // those" means exactly that, and holding an alternative does not excuse a missing required key.
    const anyOf = this.read(context, REQUIRED_ANY_PERMISSIONS_KEY);
    if (anyOf.length > 0 && !anyOf.some((permission) => granted.includes(permission))) {
      throw new ForbiddenException(`Missing permission: one of ${anyOf.join(', ')}`);
    }
    return true;
  }

  private read(context: ExecutionContext, key: string): PermissionKey[] {
    return (
      this.reflector.getAllAndOverride<PermissionKey[] | undefined>(key, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    );
  }
}
