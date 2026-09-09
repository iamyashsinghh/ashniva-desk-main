import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, PermissionKey } from '@ashniva/types';

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import type { RequestWithUser } from '../../../common/decorators/current-user.decorator';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { OrganizationMembershipsRepository } from '../../organization-memberships/organization-memberships.repository';
import { TokenService } from '../token.service';

/**
 * Global authentication guard. Every route requires a valid bearer token unless it is marked
 * with @Public(). Permissions are loaded from the membership on each request so role changes
 * apply immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly memberships: OrganizationMembershipsRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.readBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokenService.verifyAccessToken(token).catch(() => {
      throw new UnauthorizedException('Invalid or expired token');
    });

    const membership = await this.memberships.findActiveMembership(
      claims.sub,
      claims.organizationId,
    );
    if (!membership) {
      throw new UnauthorizedException('User is not an active member of this organization');
    }

    const user: AuthenticatedUser = {
      userId: claims.sub,
      organizationId: claims.organizationId,
      // A custom role behaves like the system role it was cloned from.
      roleKey: (membership.role.templateKey ?? membership.role.key) as AuthenticatedUser['roleKey'],
      permissions: membership.role.permissions.map(
        (entry) => entry.permission.key as PermissionKey,
      ),
      isServiceProvider: membership.organization.isServiceProvider,
    };

    request.user = user;
    this.tenantContext.set({ organizationId: user.organizationId, userId: user.userId });
    return true;
  }

  private readBearerToken(header: string | undefined): string | undefined {
    if (!header) {
      return undefined;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
