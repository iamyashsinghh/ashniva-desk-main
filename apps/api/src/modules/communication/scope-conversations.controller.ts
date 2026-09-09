import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthenticatedUser,
  ConversationDetail,
  ConversationParticipant,
  MessagingScopeContact,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommunicationContactsService } from './communication-contacts.service';
import { ConversationMembersService } from './conversation-members.service';
import {
  AddConversationMemberDto,
  CreateGroupDto,
  CreateScopeDirectDto,
  MessagingDirectoryQueryDto,
  UpdateConversationDto,
} from './dto/scope.dto';
import { ScopeConversationsService } from './scope-conversations.service';

/**
 * Conversations that have no project: the scope directory, direct messages, and groups.
 *
 * A second controller on the same `conversations` prefix rather than more routes on the first
 * one, because these are a different kind of request end to end — they name people rather than a
 * project, and their permission comes from a management relationship rather than from membership
 * of one. Keeping them apart also keeps each file the size somebody will actually read.
 *
 * **Its routes are registered first**, and that is not cosmetic: `GET /conversations/directory`
 * has to be matched before `GET /conversations/:id`, and Nest matches in the order the module
 * lists its controllers.
 *
 * No permission decorator here either, and for the reason the other controller gives: every
 * decision depends on *which* people are named, and a decorator cannot see them. The gate is
 * `MessagingScopeService` through `CommunicationPolicyService`, called inside each service. A
 * client is refused by the policy's first check at every route.
 */
@ApiTags('Internal communication')
@ApiBearerAuth()
@Controller()
export class ScopeConversationsController {
  constructor(
    private readonly contacts: CommunicationContactsService,
    private readonly scopeConversations: ScopeConversationsService,
    private readonly members: ConversationMembersService,
  ) {}

  /**
   * The messaging directory, which is not `GET /users/directory`.
   *
   * That one lists everybody in the organization and is gated on `task:read`, because assigning
   * work is a different question from being allowed to message somebody. This answers the
   * messaging question and only the messaging question, from `MessagingScopeService` — the same
   * resolution the two create endpoints and the add-member endpoint enforce, so every name it
   * returns is one those endpoints will accept.
   */
  @Get('conversations/directory')
  @ApiOperation({ summary: 'Who this person may message outside a project, and why' })
  directory(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MessagingDirectoryQueryDto,
  ): Promise<MessagingScopeContact[]> {
    return this.contacts.directory(actor, query.q);
  }

  @Post('conversations/direct')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Open a direct message with somebody in your management scope. One thread per pair.',
  })
  openDirect(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateScopeDirectDto,
  ): Promise<ConversationDetail> {
    return this.scopeConversations.openDirect(actor, dto);
  }

  @Post('conversations/groups')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start a group. Everybody named is checked against your scope.' })
  createGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateGroupDto,
  ): Promise<ConversationDetail> {
    return this.scopeConversations.createGroup(actor, dto);
  }

  /**
   * Renaming a group, and changing its picture.
   *
   * One route for both, because they are the same act — changing what a group *is* rather than
   * what is in it — and both turn on the same two facts: the conversation is a group, and the
   * caller administers it. Two routes would have been two copies of that decision.
   */
  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Rename a group, or set its picture. Owner and administrators only.' })
  updateConversation(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationDetail> {
    return this.scopeConversations.update(actor, id, dto);
  }

  @Get('conversations/:id/members')
  @ApiOperation({ summary: 'Who is in this conversation, and who has left it' })
  listMembers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationParticipant[]> {
    return this.members.list(actor, id);
  }

  @Post('conversations/:id/members')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add somebody to a group. Refused when they are outside your scope — in the API.',
  })
  addMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddConversationMemberDto,
  ): Promise<ConversationParticipant[]> {
    return this.members.add(actor, id, dto);
  }

  @Delete('conversations/:id/members/:userId')
  @ApiOperation({ summary: 'Take somebody out of a group. Owner and administrators only.' })
  removeMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ConversationParticipant[]> {
    return this.members.remove(actor, id, userId);
  }

  @Post('conversations/:id/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave a group. Available to everybody in one, the owner included.' })
  leave(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.members.leave(actor, id);
  }
}
