import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AuthenticatedUser,
  InvitationPreview,
  ReauthResponse,
  SessionResponse,
  SessionUser,
} from '@ashniva/types';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AccountTokensService } from './account-tokens.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth-cookies';
import { AuthService, type IssuedSession } from './auth.service';
import {
  AcceptInvitationDto,
  ForgotPasswordDto,
  ReauthDto,
  ResetPasswordDto,
} from './dto/account.dto';
import { LoginDto, SwitchOrganizationDto } from './dto/login.dto';
import { SessionResponseDto, SessionUserDto } from './dto/session-response.dto';
import { ReauthService } from './reauth.service';
import type { ClientMetadata } from './refresh-token.service';
import { SessionService } from './session.service';

/**
 * Brute-force protection on top of the global per-IP limit: 20 sign-in attempts per minute per
 * IP, each of which costs an argon2id verification on the server.
 */
export const LOGIN_ATTEMPTS_PER_MINUTE = 20;
const LOGIN_THROTTLE = { default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60_000 } };
/** Account-recovery endpoints are cheap to abuse for enumeration or spam: 5 per 15 minutes per IP. */
const RECOVERY_THROTTLE = { default: { limit: 5, ttl: 15 * 60_000 } };
const REAUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly accountTokens: AccountTokensService,
    private readonly reauth: ReauthService,
  ) {}

  @Post('login')
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with email and password',
    description:
      'Returns a short-lived access token. The refresh token is set as an httpOnly cookie scoped to /auth.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(dto, metadataFrom(request));
    return this.respond(request, response, session);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh-token cookie and get a new access token' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, revoked or reused refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const presented = readRefreshCookie(request);
    if (!presented) {
      throw new UnauthorizedException('No refresh token');
    }
    try {
      const session = await this.auth.refresh(presented, metadataFrom(request));
      return this.respond(request, response, session);
    } catch (error) {
      clearRefreshCookie(request, response);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token and clear the cookie' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<void> {
    await this.auth.logout(
      readRefreshCookie(request),
      user?.userId,
      user?.organizationId,
      metadataFrom(request),
    );
    clearRefreshCookie(request, response);
  }

  @Post('switch-organization')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a session in another organization the user belongs to' })
  @ApiOkResponse({ type: SessionResponseDto })
  async switchOrganization(
    @Body() dto: SwitchOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.switchOrganization(
      user.userId,
      dto.organizationId,
      readRefreshCookie(request),
      metadataFrom(request),
    );
    return this.respond(request, response, session);
  }

  @Get('invitations/:token')
  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @ApiOperation({ summary: 'Who an invitation is for (shown before choosing a password)' })
  invitation(@Param('token') token: string): Promise<InvitationPreview> {
    return this.accountTokens.previewInvitation(token);
  }

  @Post('invitations/accept')
  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation: set a password and sign in' })
  @ApiOkResponse({ type: SessionResponseDto })
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const metadata = metadataFrom(request);
    const accepted = await this.accountTokens.acceptInvitation(dto, metadata);
    const session = await this.auth.issueSession(
      accepted.userId,
      accepted.organizationId,
      metadata,
    );
    return this.respond(request, response, session);
  }

  @Post('forgot-password')
  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password-reset link',
    description: 'Always answers 202 so the response never reveals whether the address exists.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request): Promise<void> {
    await this.accountTokens.requestPasswordReset(dto.email, metadataFrom(request));
  }

  @Post('reset-password')
  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with a single-use reset token (signs out every device)',
  })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.accountTokens.resetPassword(dto.token, dto.password, metadataFrom(request));
  }

  @Post('reauth')
  @ApiBearerAuth()
  @Throttle(REAUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm your password before a sensitive change',
    description: 'Returns a short-lived token to send as X-Reauth-Token on routes that require it.',
  })
  confirmPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReauthDto,
  ): Promise<ReauthResponse> {
    return this.reauth.confirmPassword(user.userId, user.organizationId, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user, organization, role and permissions' })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<SessionUser> {
    return this.sessions.buildSessionUser(user.userId, user.organizationId);
  }

  private respond(request: Request, response: Response, session: IssuedSession): SessionResponse {
    setRefreshCookie(request, response, session.refreshToken, session.refreshTokenExpiresAt);
    return session.body;
  }
}

function metadataFrom(request: Request): ClientMetadata {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent'] };
}
