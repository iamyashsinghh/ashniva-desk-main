import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Signs and verifies short-lived JWT access tokens.
 * Refresh tokens are opaque and handled by RefreshTokenService.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.jwt.accessTtlSeconds;
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const { sub, ...rest } = claims;
    return this.jwtService.signAsync(rest, {
      subject: sub,
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
  }

  /** Throws (JsonWebTokenError / TokenExpiredError) when the token is invalid or expired. */
  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.jwt.accessSecret,
    });
  }
}
