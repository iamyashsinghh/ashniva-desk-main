import { Module } from '@nestjs/common';

import { SessionLogsController } from './session-logs.controller';
import { SessionLogsService } from './session-logs.service';

/** Desk login / logout / break trail for leads and managers. */
@Module({
  controllers: [SessionLogsController],
  providers: [SessionLogsService],
})
export class SessionLogsModule {}
