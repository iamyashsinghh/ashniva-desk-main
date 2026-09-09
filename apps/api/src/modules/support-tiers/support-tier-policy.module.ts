import { Global, Module } from '@nestjs/common';

import { SupportTierPoliciesRepository } from './support-tier-policies.repository';
import { SupportTierPolicyService } from './support-tier-policy.service';

/**
 * Reading tier entitlements, available everywhere.
 *
 * Global for the same reason `SafeNetModule` is: five unrelated places have to ask the same
 * question — the ingress admitting a ticket, the router setting its deadlines, the SLA clock
 * choosing a policy, the calls service offering a call, and the widget rendering its controls —
 * and a provider that each of them has to remember to import is one that some of them will not.
 *
 * Deliberately read-only. Editing a tier lives in `SupportTiersModule`, which needs the SLA
 * module in order to reapply clocks after a change; keeping that dependency out of the read path
 * is what lets this module be global without dragging half the application in behind it.
 */
@Global()
@Module({
  providers: [SupportTierPoliciesRepository, SupportTierPolicyService],
  exports: [SupportTierPoliciesRepository, SupportTierPolicyService],
})
export class SupportTierPolicyModule {}
