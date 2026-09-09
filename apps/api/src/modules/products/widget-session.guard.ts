import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { AuthenticatedWidget } from './product-context';
import { ProductsRepository } from './products.repository';
import { toAuthenticatedProduct } from './products.mapper';
import { WidgetSessionService } from './widget-session.service';

export interface RequestWithWidget extends Request {
  widget?: AuthenticatedWidget;
}

/**
 * Authenticates an embedded support widget.
 *
 * Deliberately a third mechanism rather than a branch inside `MachineCredentialGuard`. The two
 * answer different questions — *which server is this* against *which end user, on which site, of
 * which product* — and the moment they share a code path one of them inherits the other's
 * assumptions. The machine guard's assumption is that the caller is trusted infrastructure; the
 * widget's is the exact opposite.
 *
 * Four independent refusals, each sufficient on its own:
 *
 *  1. the signature does not verify, or the token has expired;
 *  2. the `Origin` header is not the one inside the signature;
 *  3. the product no longer exists, is inactive, or has support switched off;
 *  4. the origin is no longer on the product's list — so removing an origin in Desk invalidates
 *     every token already minted for it, without waiting for them to expire.
 *
 * The refusal message is uniform, as it is on the ingress: a probe learns that the session was not
 * accepted and nothing about which of the four it tripped.
 */
@Injectable()
export class WidgetSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: WidgetSessionService,
    private readonly products: ProductsRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithWidget>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Present a support session token');
    }

    const verdict = this.sessions.verify(token, request.headers.origin);
    if (!verdict.ok) {
      throw new UnauthorizedException('Present a support session token');
    }
    const { claims } = verdict;

    // Re-read rather than trust the token's copy. The claims say which product; the database says
    // what that product currently permits, which is what makes revocation immediate.
    const row = await this.products.findForWidget(claims.organizationId, claims.productId);
    if (!row || !row.isActive || !row.supportEnabled) {
      throw new UnauthorizedException('Present a support session token');
    }
    if (!row.allowedOrigins.includes(claims.origin)) {
      throw new UnauthorizedException('Present a support session token');
    }

    request.widget = {
      product: toAuthenticatedProduct(row, { credentialId: null, credentialKeyId: claims.keyId }),
      externalUserId: claims.externalUserId,
      origin: claims.origin,
    };
    this.tenantContext.set({ organizationId: row.organizationId });
    return true;
  }
}
