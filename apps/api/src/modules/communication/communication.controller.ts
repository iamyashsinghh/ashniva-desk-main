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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CallRecordingAccess,
  type CommunicationContact,
  type CommunicationSettingsSummary,
  type ConversationAudienceMember,
  type ConversationCallSummary,
  type ConversationDetail,
  type ConversationSummary,
  type MessagePage,
  type MentionablePage,
  type MessageRevisionSummary,
  type MessageSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CommunicationContactsService } from './communication-contacts.service';
import { CommunicationSettingsService } from './communication-settings.service';
import { ConversationAudienceService } from './conversation-audience.service';
import { ConversationCallHistoryService } from './conversation-call-history.service';
import { ConversationCallsService } from './conversation-calls.service';
import { ConversationRecordingService } from './conversation-recording.service';
import { ConversationsService } from './conversations.service';
import {
  CreateConversationDto,
  EditMessageDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MentionableQueryDto,
  SaveCommunicationSettingsDto,
  SendMessageDto,
  StartConversationCallDto,
} from './dto/communication.dto';
import { ConversationMentionsService } from './conversation-mentions.service';
import { MessageModerationService } from './message-moderation.service';
import { MessagesService } from './messages.service';
import { OversightService } from './oversight.service';

/**
 * Internal conversations over HTTP.
 *
 * Only two routes carry a permission decorator, and that is not an oversight. Almost every
 * decision here depends on *which* conversation is being asked about — a developer may post in
 * one project's thread and not another's — and a decorator cannot see the row. So the gate is
 * `CommunicationPolicyService`, called inside each service with the conversation in hand, exactly
 * as ownership is decided everywhere else in this codebase. The decorators that remain are the
 * two organization-wide ones, where there is no row to consult.
 *
 * A client user is refused by the policy's first check, before any query runs, at every route on
 * this controller. There is no client shape of any of it.
 */
@ApiTags('Internal communication')
@ApiBearerAuth()
@Controller()
export class CommunicationController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly contacts: CommunicationContactsService,
    private readonly messages: MessagesService,
    private readonly moderation: MessageModerationService,
    private readonly audienceService: ConversationAudienceService,
    private readonly mentions: ConversationMentionsService,
    private readonly calls: ConversationCallsService,
    private readonly callHistory: ConversationCallHistoryService,
    private readonly recordings: ConversationRecordingService,
    private readonly settings: CommunicationSettingsService,
    private readonly oversight: OversightService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Conversations this person may see, most recent first' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ConversationSummary[]> {
    return this.conversations.list(actor, query);
  }

  @Get('conversations/contacts')
  @ApiOperation({ summary: 'Who this person may start a direct conversation with' })
  listContacts(@CurrentUser() actor: AuthenticatedUser): Promise<CommunicationContact[]> {
    return this.contacts.list(actor);
  }

  @Post('conversations')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Open a conversation, creating it the first time. Idempotent by its anchor.',
  })
  open(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationDetail> {
    return this.conversations.open(actor, dto);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation, with what this caller may do in it' })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetail> {
    return this.conversations.detail(actor, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'A page of messages, oldest first' })
  messagesOf(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessagePage> {
    return this.messages.list(actor, id, query);
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  @ApiOperation({ summary: 'Send a message. A retry with the same client id posts once.' })
  send(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageSummary> {
    return this.messages.send(actor, id, dto);
  }

  @Patch('conversations/:id/messages/:messageId')
  @ApiOperation({
    summary: 'Rewrite your own message, inside the edit window. Keeps what it said before.',
  })
  editMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
  ): Promise<MessageSummary> {
    return this.moderation.edit(actor, id, messageId, dto);
  }

  /**
   * A soft delete, and it returns the tombstone rather than 204.
   *
   * The row keeps its place in the thread, so the screen has something to render where the
   * message was; handing that back saves the caller a refetch to find out what happened.
   */
  @Delete('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: 'Withdraw a message. Its sender, or oversight (audited).' })
  deleteMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<MessageSummary> {
    return this.moderation.remove(actor, id, messageId);
  }

  @Get('conversations/:id/messages/:messageId/revisions')
  @ApiOperation({ summary: 'Oversight: what a message said before it was edited (audited)' })
  messageRevisions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<MessageRevisionSummary[]> {
    return this.moderation.revisions(actor, id, messageId);
  }

  /**
   * Who may be mentioned here.
   *
   * The same audience the send path intersects a mention against, so the picker cannot offer
   * somebody the notification would then silently refuse to reach.
   */
  @Get('conversations/:id/audience')
  @ApiOperation({ summary: 'Who may read this conversation, and so who may be mentioned in it' })
  audience(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationAudienceMember[]> {
    return this.audienceService.listFor(actor, id);
  }

  /**
   * Who may be mentioned here, searchable and paged.
   *
   * The picker's endpoint, and the same audience the send path refuses a forged mention against —
   * so a name this offers is a name a message will reach, and a name it does not offer is one the
   * send path rejects. Never a user directory: the candidate set is this conversation's own
   * audience, which for a task thread is the people with a place on the task.
   */
  @Get('conversations/:id/mentionable')
  @ApiOperation({ summary: 'Who this caller may mention in this conversation' })
  mentionable(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MentionableQueryDto,
  ): Promise<MentionablePage> {
    return this.mentions.list(actor, id, query);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Move this person’s read cursor to now' })
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.conversations.markRead(actor, id);
  }

  @Post('conversations/:id/calls')
  @HttpCode(201)
  @ApiOperation({ summary: 'Call somebody from this conversation through Ashniva IVR' })
  startCall(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartConversationCallDto,
  ): Promise<ConversationCallSummary> {
    return this.calls.start(actor, id, dto);
  }

  @Get('conversations/:id/calls')
  @ApiOperation({ summary: 'The calls placed from this conversation' })
  listCalls(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationCallSummary[]> {
    return this.callHistory.list(actor, id);
  }

  /**
   * No decorator, deliberately: `conversation:recording-play` *is* required, and it is checked in
   * the service so that every refusal is audited with its reason. A guard rejecting first would
   * make the most interesting refusals the only ones that leave no trace.
   */
  @Get('conversations/calls/:callId/recording')
  @ApiOperation({ summary: 'A short-lived URL for an internal call recording (audited)' })
  recording(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', ParseUUIDPipe) callId: string,
  ): Promise<CallRecordingAccess> {
    return this.recordings.play(actor, callId);
  }

  @Get('communication/settings')
  @RequirePermissions(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'The organization’s internal chat and calling switches' })
  readSettings(@CurrentUser() actor: AuthenticatedUser): Promise<CommunicationSettingsSummary> {
    return this.settings.read(actor);
  }

  @Put('communication/settings')
  @RequirePermissions(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Change the switches (audited)' })
  saveSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveCommunicationSettingsDto,
  ): Promise<CommunicationSettingsSummary> {
    return this.settings.save(actor, dto);
  }

  @Get('communication/oversight/conversations')
  @ApiOperation({ summary: 'Oversight: every conversation in the organization (audited)' })
  oversightConversations(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ConversationSummary[]> {
    return this.oversight.conversationsFor(actor, {
      projectId: query.projectId,
      limit: query.limit,
    });
  }

  @Get('communication/oversight/calls')
  @ApiOperation({ summary: 'Oversight: internal call history (audited)' })
  oversightCalls(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ConversationCallSummary[]> {
    return this.oversight.callsFor(actor, { projectId: query.projectId, limit: query.limit });
  }
}
