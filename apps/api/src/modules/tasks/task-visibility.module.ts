import { Module } from '@nestjs/common';

import { TaskChatScopeService } from './task-chat-scope.service';
import { TaskVisibilityService } from './task-visibility.service';

/**
 * Task visibility on its own, so every module that reads a task can consume the same answer.
 *
 * It is a module rather than a provider inside `TasksModule` because the surfaces that leaked
 * tasks are spread across the application — client updates, files, git activity, the QA queue,
 * the dashboards — and several of them are imported *by* `TasksModule`. A scope resolver that
 * lived there could only be shared by making those imports circular, which is how a second copy
 * of the rule gets written.
 *
 * It depends on nothing but Prisma, which is what keeps it importable from anywhere.
 */
@Module({
  // `TaskChatScopeService` lives here rather than in the communication module because it is a
  // narrower reading of the *same* relations, and a scope rule kept beside the thing it scopes is
  // one somebody changing task relations will find.
  providers: [TaskVisibilityService, TaskChatScopeService],
  exports: [TaskVisibilityService, TaskChatScopeService],
})
export class TaskVisibilityModule {}
