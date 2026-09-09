import { Injectable } from '@nestjs/common';

/**
 * The seam between package 9's call machinery and package 9b's internal calls.
 *
 * A support call and an internal call share everything except the one thing that matters: where
 * they go next when nobody answers. A support call walks package 8b's chain, because a client's
 * problem belongs to whoever can take it. An internal call must not — connecting a private
 * developer-to-tester call onward to a support agent would be a disclosure, not a fallback.
 *
 * That difference belongs to package 9b, which knows about conversations. But this module cannot
 * import it: `CommunicationModule` imports `CallLogsModule` for the provider, the call log and
 * the lifecycle, and a return edge would be a cycle.
 *
 * So the handler registers itself here at start-up. It is a service locator, which is not the
 * prettiest pattern in the file, and it is preferred to the alternatives on purpose: a queue
 * would make a lost job into a lost call, and inverting the module graph would put conversations
 * underneath telephony, which is the wrong way round. One small, explicit, typed seam is the
 * honest cost of keeping the two packages independent.
 */
export interface InternalCallAdvancer {
  /** Ring the next destination for an internal call, or end it with a stated reason. */
  advance(organizationId: string, callId: string): Promise<void>;
}

@Injectable()
export class InternalCallAdvancerRegistry {
  private handler: InternalCallAdvancer | null = null;

  register(handler: InternalCallAdvancer): void {
    this.handler = handler;
  }

  /**
   * The registered handler, or null when package 9b is not part of this deployment.
   *
   * Null is a real answer rather than an error: an internal call cannot exist without the module
   * that creates one, so a null handler means there is nothing of this kind to advance.
   */
  get(): InternalCallAdvancer | null {
    return this.handler;
  }
}
