import { Module } from '@nestjs/common';

import { WorkPlanLogoutPauseService } from './work-plan-logout-pause.service';

/**
 * Tiny module so Auth can pause work-plan timers on logout without importing the
 * full ProjectWorkPlansModule (and its Tasks/Projects/Notifications graph).
 */
@Module({
  providers: [WorkPlanLogoutPauseService],
  exports: [WorkPlanLogoutPauseService],
})
export class WorkPlanLogoutPauseModule {}
