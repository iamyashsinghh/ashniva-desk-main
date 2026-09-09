import { Global, Module } from '@nestjs/common';

import { SafeDestinationService } from './safe-destination.service';

/**
 * Global, for the same reason `SafeHttpModule` is.
 *
 * A guard that a provider has to remember to import is a guard some provider will forget, and the
 * one that forgets is the hole. Issue #22 was exactly that shape: the SSRF work covered the five
 * HTTP call sites and the SMTP transport quietly stayed outside it.
 */
@Global()
@Module({
  providers: [SafeDestinationService],
  exports: [SafeDestinationService],
})
export class SafeNetModule {}
