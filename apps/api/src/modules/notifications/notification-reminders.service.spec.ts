import { NOTIFICATION_TYPE } from '@ashniva/types';

import type { NotifyInput } from './notification-dispatcher.service';
import { NotificationRemindersService } from './notification-reminders.service';

const PROVIDER = 'provider-org';
const CLIENT = 'client-org';
const CONTRACT = 'contract-1';
const NOW = new Date('2026-09-01T09:00:00.000Z');

/**
 * Contract reminders reach both sides of a contract, and each side must be able to open it: the
 * provider on its own contract page, the client on the portal's. A reminder with no link used to
 * open nothing when tapped, on a phone or in a browser.
 */
function serviceWith(contract: Record<string, unknown>) {
  const sent: NotifyInput[] = [];
  const prisma = {
    task: { findMany: jest.fn(async () => []) },
    contract: { findMany: jest.fn(async () => [contract]) },
  };
  const dispatcher = {
    notify: jest.fn(async (input: NotifyInput) => {
      sent.push(input);
      return { created: input.recipients.length, grouped: 0, skipped: 0, deferred: 0 };
    }),
  };
  const recipients = {
    withPermission: jest.fn(async (organizationId: string) => [
      { userId: `${organizationId}-person`, organizationId },
    ]),
    member: jest.fn(async () => []),
  };
  const ledger = {
    ensureCurrentBalance: jest.fn(async () => ({
      isLow: true,
      remainingMinutes: 90,
      periodStart: '2026-09-01',
    })),
  };
  const service = new NotificationRemindersService(
    prisma as never,
    dispatcher as never,
    recipients as never,
    ledger as never,
  );
  return { service, sent };
}

const BASE = {
  id: CONTRACT,
  organizationId: PROVIDER,
  clientOrganizationId: CLIENT,
  numberLabel: 'CON-7',
  title: 'Support retainer',
  clientOrganization: { name: 'Acme' },
  renewalDate: null,
  renewalNoticeDays: 30,
  includedMinutesPerPeriod: 0,
  type: 'FIXED',
};

describe('NotificationRemindersService contract links', () => {
  it('sends an expiry reminder to each side with the page that side opens', async () => {
    const { service, sent } = serviceWith({
      ...BASE,
      endDate: new Date('2026-09-08T00:00:00.000Z'),
    });

    const result = await service.run(NOW);

    const expiries = sent.filter((input) => input.type === NOTIFICATION_TYPE.CONTRACT_EXPIRY);
    expect(expiries.map((input) => [input.recipients[0]?.organizationId, input.link])).toEqual([
      [PROVIDER, `/contracts/${CONTRACT}`],
      [CLIENT, `/portal/contracts/${CONTRACT}`],
    ]);
    expect(result.expiries).toBe(2);
  });

  it('links the low-hours alert the same way', async () => {
    const { service, sent } = serviceWith({
      ...BASE,
      endDate: null,
      type: 'SUPPORT_HOURS',
      includedMinutesPerPeriod: 600,
    });

    const result = await service.run(NOW);

    const low = sent.filter((input) => input.type === NOTIFICATION_TYPE.SUPPORT_HOURS_LOW);
    expect(low.map((input) => input.link)).toEqual([
      `/contracts/${CONTRACT}`,
      `/portal/contracts/${CONTRACT}`,
    ]);
    expect(result.lowHours).toBe(2);
  });
});
