import { Global, Module } from '@nestjs/common';

import { ErrorReporter, NoopErrorReporter } from './error-reporter';

/**
 * The error-reporting seam.
 *
 * One provider, deliberately. Sending unhandled errors to Sentry, GlitchTip or an internal
 * collector means replacing `useClass` here — not touching the exception filter, which is the
 * file you least want to be editing during an incident.
 */
@Global()
@Module({
  providers: [{ provide: ErrorReporter, useClass: NoopErrorReporter }],
  exports: [ErrorReporter],
})
export class ErrorsModule {}
