import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { UsersModule } from '../users/users.module';
import { AccountTokensRepository } from './account-tokens.repository';
import { AccountTokensService } from './account-tokens.service';
import { AUTH_MAILER, LoggingAuthMailer } from './auth-mail.port';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RecentAuthGuard } from './guards/recent-auth.guard';
import { ReauthService } from './reauth.service';
import { PasswordHashingService } from './password-hashing.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Authentication: password hashing, JWT access tokens, refresh-token rotation (httpOnly cookie),
 * login / refresh / logout / switch-organization / me, and the global guards.
 */
@Module({
  imports: [JwtModule.register({}), OrganizationMembershipsModule, forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [
    PasswordHashingService,
    TokenService,
    RefreshTokenRepository,
    RefreshTokenService,
    SessionService,
    AuthService,
    AccountTokensRepository,
    AccountTokensService,
    ReauthService,
    { provide: AUTH_MAILER, useClass: LoggingAuthMailer },
    JwtAuthGuard,
    PermissionsGuard,
    RecentAuthGuard,
  ],
  exports: [
    PasswordHashingService,
    TokenService,
    RefreshTokenService,
    SessionService,
    AccountTokensService,
    ReauthService,
    JwtAuthGuard,
    PermissionsGuard,
    RecentAuthGuard,
  ],
})
export class AuthModule {}
