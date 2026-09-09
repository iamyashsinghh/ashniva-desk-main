import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { GitWebhooksController } from './git-webhooks.controller';
import { GitController } from './git.controller';
import { GitRepository } from './git.repository';
import { GitService } from './git.service';
import { GIT_PROVIDERS } from './providers/git-provider.interface';
import { GithubProvider } from './providers/github.provider';
import { GitlabProvider } from './providers/gitlab.provider';

/**
 * GitHub and GitLab: repository links, verified webhooks, task linking and development activity.
 *
 * Both providers are registered through GIT_PROVIDERS, so GitService never branches on the
 * provider name and a third provider is an adapter plus one line here.
 */
@Module({
  imports: [IntegrationsModule, AuditLogsModule, TaskVisibilityModule],
  controllers: [GitController, GitWebhooksController],
  providers: [
    GitRepository,
    GitService,
    GithubProvider,
    GitlabProvider,
    {
      provide: GIT_PROVIDERS,
      useFactory: (github: GithubProvider, gitlab: GitlabProvider) => [github, gitlab],
      inject: [GithubProvider, GitlabProvider],
    },
  ],
  exports: [GitService, GitRepository],
})
export class GitIntegrationModule {}
