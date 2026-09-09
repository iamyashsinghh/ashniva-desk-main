# support-tiers

**Owns:** What a support tier entitles a product to.

**Entities:** `support_tier_policies`

**Permission:** `support-tier:manage` to edit, `product:read` to see.

## Why it exists

`supportTier` has been on every product since the registry shipped, with the type comment
"Recorded now; priced later", and exactly one line in the codebase read it: `calls.service.ts`,
to decide whether a tier may raise a call. Everything else stored it, mapped it or displayed it.

This turns it into behaviour — and deliberately only into behaviour. There is no amount here, no
currency, no billing link and no opinion about which tier ought to get what. What a tier is worth
commercially is a decision somebody makes per organization and records in these rows; hard-coding
one would make every customer's pricing a deployment.

## Absence is neutral, everywhere

A tier with no row behaves exactly as it did before this table existed, and a null column leaves
that one aspect alone. This is the same convention `ProductIvrPolicy.allowedTiers` already uses,
where an empty list means every tier: an unconfigured policy must never read as a restrictive one,
or shipping the feature would silently close support for every customer who had not configured it.

`neutralTierPolicy` in `packages/types` states what that means, field by field, and
`resolveTierPolicy` is the only way a tier is looked up.

## What a tier changes, and where

| Setting | Seam | Note |
| --- | --- | --- |
| `admissionEnabled` | `SupportIngressService.assertOpen` | Joins the two switches behind one message, keeping the uniform refusal. The sentence goes to the screens. |
| `slaPolicyId` | `SlaPoliciesRepository.findForTicket` | A rung between the project's policy and the client's — a client may run several products at different tiers, so the tier is the narrower statement |
| `minimumPriority` | `SupportIngressService.raise` | Raises a request and never lowers one |
| `ackMinutes`, `escalationMinutes` | `TicketRoutingService.assign` | Changes *when*, never *who* |
| `callsEnabled`, `requesterInitiatedCalls` | `calls.service.refusalFor` | Consulted alongside the product's IVR policy, not instead of it |
| `dedicatedOwnership`, `fallbackStrategy`, `availabilityWindow` | recorded and surfaced | See "Open" below |

## `ROUTING_POLICY_VERSION` stays 1

The tier moves deadlines and nothing else: the routing chain, the eligibility rules and the trail
`planRouting` produces are untouched. A trail read a year from now is still interpretable against
version 1, because version 1 is still what decided it. Anything that changed the chain or the
eligibility would have to bump it.

## SLA reapplication

Both `ProductsService.update` (a product's tier changed) and `SupportTiersService.update` (the
tier's SLA selection changed) call `TicketSlaService.reapply`, exactly as `SlaPoliciesService` does
after a policy edit. Without it, open tickets would keep yesterday's deadlines while every screen
showed today's rules. The tier editor only reapplies when the SLA selection actually moved — a
change to, say, the fallback strategy should not rewrite every clock in the tenant.

## Two modules, on purpose

`SupportTierPolicyModule` is `@Global()` and read-only: the ingress, the router, the SLA clock, the
calls service and the widget all resolve entitlements, and a provider each of them has to remember
to import is one some of them will not. `SupportTiersModule` holds the controller and the write
service, and imports `SlaEscalationsModule` for the reapplication — a dependency that would
otherwise be dragged into every module in the application.

## Open

`dedicatedOwnership`, `fallbackStrategy` and `availabilityWindow` are recorded, resolvable and
shown, but no seam consumes them yet: each would change *who* a ticket reaches or when a clock
runs, which means bumping `ROUTING_POLICY_VERSION` or reworking the SLA calendar. Both are
deliberate follow-ups rather than something to slip in behind a settings field.

That is now said where somebody would otherwise be misled by it: the three fields carry the caveat
in their Swagger descriptions and under their controls on the tiers card. An administrator who
picks "tell the support executive at once" and reads nothing else would reasonably believe an
executive is being told.
