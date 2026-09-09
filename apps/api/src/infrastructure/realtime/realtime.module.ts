import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../../modules/auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeRoomsRepository } from './realtime-rooms.repository';
import { RealtimeService } from './realtime.service';

/** Socket.IO gateway plus the service domain modules use to emit room-scoped events. */
@Global()
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeRoomsRepository, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
