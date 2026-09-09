import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { parseMachineCredential } from '@ashniva/types';
import type { Request } from 'express';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { ProductCredentialsService } from './product-credentials.service';
import type { AuthenticatedProduct } from './product-context';

export interface RequestWithProduct extends Request {
  product?: AuthenticatedProduct;
}

/**
 * Authenticates a calling product rather than a person.
 *
 * Deliberately not the JWT guard with a special case bolted on. An employee token and a machine
 * credential answer different questions — *who is this person and what may they do* against
 * *which product is this and what is it allowed to raise* — and the moment those share a code
 * path, one of them ends up carrying the other's assumptions. So the ingress routes are
 * `@Public()` to the JWT guard and gated by this instead.
 *
 * The failure messages are uniform on purpose: a caller learns that the credential was not
 * accepted and nothing about *why*, so a wrong key and a revoked key and a disabled product are
 * indistinguishable from outside. Inside, they are all audited separately.
 */
@Injectable()
export class MachineCredentialGuard implements CanActivate {
  constructor(
    private readonly credentials: ProductCredentialsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithProduct>();
    const header = request.headers.authorization;
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Present a product credential');
    }
    const parsed = parseMachineCredential(token);
    if (!parsed) {
      // Not even the right shape. Refused before anything touches the database, so a malformed
      // header costs an argon2 verification of nothing.
      throw new UnauthorizedException('Present a product credential');
    }

    const product = await this.credentials.authenticate(parsed.keyId, parsed.secret);
    if (!product) {
      throw new UnauthorizedException('Present a product credential');
    }

    request.product = product;
    // The ingress runs as the provider organization that owns the product. There is no user, so
    // no user id is set — everything downstream is scoped by the product record rather than by a
    // person's memberships.
    this.tenantContext.set({ organizationId: product.organizationId });
    return true;
  }
}
