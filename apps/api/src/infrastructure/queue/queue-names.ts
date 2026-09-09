/**
 * Every BullMQ queue name in one place. Add a queue here, then register it in the module that
 * owns its processor with BullModule.registerQueue({ name: QUEUE_NAMES.X }).
 *
 * A name with no `registerQueue` and no processor is not a placeholder for later work, it is a
 * queue that silently does not exist: `github-webhooks` sat here through four phases while git
 * webhooks were built and delivered synchronously. Delete the name instead, and add it back on
 * the day something registers it.
 */
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  SLA_MONITOR: 'sla-monitor',
  ROUTING_MONITOR: 'routing-monitor',
  DAILY_REPORTS: 'daily-reports',
  CONTRACTS: 'contracts',
  IVR_EVENTS: 'ivr-events',
  RELEASE_NOTES: 'release-notes',
  MESSAGING: 'messaging',
  BILLING: 'billing',
  AI_SUMMARIES: 'ai-summaries',
  SUPPORT_CALLBACKS: 'support-callbacks',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
