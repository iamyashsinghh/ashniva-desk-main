import { Global, Module } from '@nestjs/common';

import { SafeHttpService } from './safe-http.service';

/**
 * Global so that every outbound integration reaches the same guard.
 *
 * A provider that had to remember to import this could forget to, and the one that forgot would
 * be the hole. There is deliberately no way to opt out.
 */
@Global()
@Module({
  providers: [SafeHttpService],
  exports: [SafeHttpService],
})
export class SafeHttpModule {}
