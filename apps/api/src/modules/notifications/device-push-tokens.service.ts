import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser, PushDevicePlatform } from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DevicePushTokensRepository } from './device-push-tokens.repository';

export interface RegisterDeviceInput {
  token: string;
  platform: PushDevicePlatform;
}

/**
 * Expo push tokens for the mobile app, one per install.
 *
 * A token identifies a phone, not a person. When a phone signs in as somebody else its token is
 * re-bound to them, so the previous person's notifications stop arriving on a device they no
 * longer use. People manage only their own devices; delivery reads and prunes tokens on behalf
 * of the dispatcher.
 */
@Injectable()
export class DevicePushTokensService {
  constructor(
    private readonly repository: DevicePushTokensRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  register(actor: AuthenticatedUser, input: RegisterDeviceInput, now = new Date()): Promise<void> {
    const token = input.token.trim();
    if (!token) {
      throw new BadRequestException('Push token is required');
    }
    // As the system: the row being re-bound may belong to a person in another organization, which
    // row-level security would hide from this request — the upsert would then miss it and trip
    // the unique index instead. Every value written comes from the caller's own session.
    return this.tenantContext.runAsSystem(() =>
      this.repository.upsert({
        organizationId: actor.organizationId,
        userId: actor.userId,
        token,
        platform: input.platform,
        lastSeenAt: now,
      }),
    );
  }

  /** Forgets a token, but only the caller's own: anyone else's token is left alone, silently. */
  async unregister(actor: AuthenticatedUser, token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException('Push token is required');
    }
    await this.repository.deleteOwned(actor.organizationId, actor.userId, trimmed);
  }

  tokensFor(organizationId: string, userIds: readonly string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository.tokensFor(organizationId, userIds);
  }

  /** Drops tokens the push service reported as gone (app uninstalled, permission revoked). */
  async remove(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    await this.repository.deleteTokens(tokens);
  }
}
