import { Module } from '@nestjs/common';

import { ConversationMembersRepository } from './conversation-members.repository';
import { ConversationsRepository } from './conversations.repository';
import { ProjectTeamGroupService } from './project-team-group.service';

/**
 * One group chat per project, kept beside the project rather than inside CommunicationModule.
 *
 * Projects and teams import this leaf so a create/update can keep the group in line without
 * pulling the rest of messaging (and without a cycle: CommunicationModule already sits above
 * tickets, which sit above tasks, which sit above projects).
 */
@Module({
  providers: [ProjectTeamGroupService, ConversationsRepository, ConversationMembersRepository],
  exports: [ProjectTeamGroupService],
})
export class ProjectTeamGroupModule {}
