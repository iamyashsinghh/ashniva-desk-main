import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CredentialAccessLogRow,
  type CredentialGrantSummary,
  type PaginatedResponse,
  type RevealedCredential,
  type TestAccountSummary,
} from '@ashniva/types';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CredentialGrantsService } from './credential-grants.service';
import { CredentialRevealService, type RevealContext } from './credential-reveal.service';
import {
  CreateTestAccountDto,
  GrantCredentialDto,
  ListAccessLogQueryDto,
  RotateTestAccountDto,
  UpdateTestAccountDto,
} from './dto/test-account.dto';
import { TestAccountResetService } from './test-account-reset.service';
import { TestAccountsService } from './test-accounts.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Test logins, grants and the access log.
 *
 * Every route needs `test-account:manage` except the reveal, which needs `test-credential:reveal`
 * instead — being allowed to look after test logins and being allowed to read one are different
 * things, and the person who manages them is usually not the person testing.
 */
@ApiTags('Test accounts')
@ApiBearerAuth()
@Controller()
export class TestAccountsController {
  constructor(
    private readonly testAccounts: TestAccountsService,
    private readonly grants: CredentialGrantsService,
    private readonly reveals: CredentialRevealService,
    private readonly reset: TestAccountResetService,
  ) {}

  @Get('projects/:id/test-accounts')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: "A project's test logins. Never carries a password." })
  list(@CurrentUser() actor: Actor, @id() projectId: string): Promise<TestAccountSummary[]> {
    return this.testAccounts.listForProject(actor, projectId);
  }

  @Post('projects/:id/test-accounts')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Record a test login; the password is encrypted at rest' })
  create(
    @CurrentUser() actor: Actor,
    @id() projectId: string,
    @Body() dto: CreateTestAccountDto,
  ): Promise<TestAccountSummary> {
    return this.testAccounts.create(actor, projectId, dto);
  }

  @Patch('test-accounts/:id')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Edit label, username, notes, rotation policy or active flag' })
  update(
    @CurrentUser() actor: Actor,
    @id() accountId: string,
    @Body() dto: UpdateTestAccountDto,
  ): Promise<TestAccountSummary> {
    return this.testAccounts.update(actor, accountId, dto);
  }

  @Post('test-accounts/:id/grant')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({
    summary: 'Let one person reveal this password until a stated time (8 h default)',
  })
  grant(
    @CurrentUser() actor: Actor,
    @id() accountId: string,
    @Body() dto: GrantCredentialDto,
  ): Promise<CredentialGrantSummary> {
    return this.grants.grant(actor, accountId, dto);
  }

  @Post('test-accounts/:id/rotate')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'New password; every outstanding grant is revoked with it' })
  rotate(
    @CurrentUser() actor: Actor,
    @id() accountId: string,
    @Body() dto: RotateTestAccountDto,
  ): Promise<TestAccountSummary> {
    return this.testAccounts.rotate(actor, accountId, dto);
  }

  @Post('test-accounts/:id/reset-data')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: "Call the product's endpoint to put this account's data back" })
  resetData(@CurrentUser() actor: Actor, @id() accountId: string): Promise<void> {
    return this.reset.reset(actor, accountId);
  }

  @Post('grants/:id/reveal')
  @RequirePermissions(PERMISSIONS.TEST_CREDENTIAL_REVEAL)
  @ApiOperation({ summary: 'The password, once, against your own live grant. Logged first.' })
  reveal(
    @CurrentUser() actor: Actor,
    @id() grantId: string,
    @Req() request: Request,
  ): Promise<RevealedCredential> {
    return this.reveals.reveal(actor, grantId, revealContext(request));
  }

  @Get('credential-access-log')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Who saw which test password, when and from where' })
  accessLog(
    @CurrentUser() actor: Actor,
    @Query() query: ListAccessLogQueryDto,
  ): Promise<PaginatedResponse<CredentialAccessLogRow>> {
    return this.grants.accessLog(actor, query);
  }
}

/** Recorded beside the reveal. It decides nothing — it is there for the person reading the log. */
function revealContext(request: Request): RevealContext {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent'] };
}
