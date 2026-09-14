import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { IvrModule } from '../ivr/ivr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { TicketRoutingModule } from '../ticket-routing/ticket-routing.module';
import { CommunicationController } from './communication.controller';
import { ScopeConversationsController } from './scope-conversations.controller';
import { CommunicationGateway } from './communication.gateway';
import { CommunicationContactsService } from './communication-contacts.service';
import { CommunicationNotificationsService } from './communication-notifications.service';
import { CommunicationFactsService } from './communication-facts.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { CommunicationRealtimeService } from './communication-realtime.service';
import { CommunicationSettingsService } from './communication-settings.service';
import { ConversationAnchorService } from './conversation-anchor.service';
import { ConversationMembersService } from './conversation-members.service';
import { ConversationAudienceService } from './conversation-audience.service';
import { ConversationCallHistoryService } from './conversation-call-history.service';
import { ConversationCallsService } from './conversation-calls.service';
import { ConversationRecordingService } from './conversation-recording.service';
import { ConversationMentionsService } from './conversation-mentions.service';
import { ConversationMembersRepository } from './conversation-members.repository';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { InternalCallRoutingService } from './internal-call-routing.service';
import { MessageModerationService } from './message-moderation.service';
import { MessagesService } from './messages.service';
import { MessagingScopeService } from './messaging-scope.service';
import { ProjectTeamGroupModule } from './project-team-group.module';
import { ScopeConversationsService } from './scope-conversations.service';
import { OversightService } from './oversight.service';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';

/**
 * Project-scoped internal communication.
 *
 * Imports rather than reimplements, in every direction: `CallLogsModule` and `IvrModule` for the
 * telephony this package must not duplicate, `TicketRoutingModule` for package 8a's availability
 * resolver, `NotificationsModule` for the dispatcher, and the global realtime service for the
 * socket. The only thing it owns exclusively is the judgement about who may talk to whom, and
 * that lives in `packages/types` where it can be tested without a database.
 *
 * The direction of the call seam is worth noting: this module imports `CallLogsModule`, and
 * package 9 hands internal calls *back* through `InternalCallAdvancerRegistry` rather than
 * importing this one. Conversations sit above telephony, not beside it.
 */
@Module({
  imports: [
    CallLogsModule,
    IvrModule,
    TicketRoutingModule,
    NotificationsModule,
    AuthModule,
    OrganizationMembershipsModule,
    // The task-chat scope: a task conversation admits the people with a place on the task, and
    // that narrower reading of the task relations belongs beside them rather than here.
    TaskVisibilityModule,
    ProjectTeamGroupModule,
  ],
  // The scope controller first: `GET /conversations/directory` must be matched before
  // `GET /conversations/:id`, and Nest matches in the order this array lists.
  controllers: [ScopeConversationsController, CommunicationController],
  providers: [
    CommunicationSettingsService,
    MessagingScopeService,
    CommunicationFactsService,
    CommunicationPolicyService,
    ConversationsRepository,
    ConversationMembersRepository,
    ConversationAnchorService,
    ConversationsService,
    ScopeConversationsService,
    ConversationMembersService,
    CommunicationContactsService,
    CommunicationRealtimeService,
    CommunicationNotificationsService,
    ConversationAudienceService,
    ConversationMentionsService,
    MessagesService,
    MessageModerationService,
    InternalCallRoutingService,
    ConversationCallHistoryService,
    ConversationCallsService,
    ConversationRecordingService,
    OversightService,
    CommunicationGateway,
  ],
  exports: [
    CommunicationPolicyService,
    ConversationsService,
    MessagingScopeService,
    ProjectTeamGroupModule,
  ],
})
export class CommunicationModule {}
