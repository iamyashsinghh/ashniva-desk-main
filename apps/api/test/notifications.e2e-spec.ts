import type { INestApplication } from '@nestjs/common';
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_CHANNEL,
  type NotificationPreferenceEntry,
} from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

interface NotificationItem {
  id: string;
  type: string;
  entityId: string | null;
  link: string | null;
  groupedCount: number;
  readAt: string | null;
}

/**
 * Notifications: events reach the right people and nobody else → grouping and de-duplication →
 * read state → per-type preferences → quiet hours defer delivery until the job runs →
 * approvals and change requests notify both sides → tenant isolation of the inbox.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let support: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let acmeId = '';
  let projectId = '';
  let ticketId = '';
  const api = () => request(app.getHttpServer());
  const stamp = Date.now();

  /**
   * The per-minute rate limit defers bursts (the whole e2e run fires many events at the same
   * people within a minute); pretend the deferral ended and run the delivery job.
   */
  const flush = async (sessions: Session[]) => {
    await prisma.notification.updateMany({
      where: { userId: { in: sessions.map((s) => s.body.user.id) }, deliveredAt: null },
      data: { deliverAfter: new Date(Date.now() - 1000) },
    });
    await api()
      .post('/api/v1/notifications/jobs/deliver')
      .set('Authorization', bearer(director))
      .expect(201);
  };
  const inboxRaw = async (session: Session, unread = false): Promise<NotificationItem[]> =>
    (
      await api()
        .get(`/api/v1/notifications?limit=50${unread ? '&unread=true' : ''}`)
        .set('Authorization', bearer(session))
        .expect(200)
    ).body.items;
  /** Inbox after pushing any rate-limited rows through (see flush below). */
  const inbox = async (session: Session, unread = false): Promise<NotificationItem[]> => {
    await flush([session]);
    return inboxRaw(session, unread);
  };
  const ofEntity = (items: NotificationItem[], type: string, entityId: string) =>
    items.filter((item) => item.type === type && item.entityId === entityId);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, support, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    acmeId = clientAdmin.body.user.organization.id;
    projectId = (await prisma.project.findFirstOrThrow({ where: { code: 'ACM' } })).id;
    // Earlier runs may have left preferences behind; start from the defaults.
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: [clientAdmin.body.user.id, support.body.user.id] } },
    });
    await prisma.notificationSetting.deleteMany({ where: { userId: support.body.user.id } });
  });

  afterAll(async () => {
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(support))
      .send({ quietHoursEnabled: false });
    await app.close();
  });

  it('a raised ticket notifies the people who triage tickets, not developers', async () => {
    const raised = await api()
      .post('/api/v1/portal/tickets')
      .set('Authorization', bearer(clientAdmin))
      .send({
        title: `Notify e2e ${stamp}`,
        description: 'Barcode scanner stops after sleep.',
        type: 'BUG',
        priority: 'MEDIUM',
        projectId,
      })
      .expect(201);
    ticketId = raised.body.id;
    const mine = ofEntity(await inbox(support, true), 'TICKET_NEW', ticketId);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.link).toBe(`/tickets/${ticketId}`);
    expect(ofEntity(await inbox(developer), 'TICKET_NEW', ticketId)).toHaveLength(0);
    expect(ofEntity(await inbox(clientAdmin), 'TICKET_NEW', ticketId)).toHaveLength(0);
    const badge = await api()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', bearer(support))
      .expect(200);
    expect(badge.body.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it('two public replies in a row are grouped into one notification for the requester', async () => {
    for (const body of ['Looking into it.', 'Could you share the scanner model?']) {
      await api()
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', bearer(support))
        .send({ body, visibility: 'CLIENT' })
        .expect(201);
    }
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(support))
      .send({ body: 'Internal: probably the USB power setting', visibility: 'INTERNAL' })
      .expect(201);
    const replies = ofEntity(await inbox(clientAdmin, true), 'TICKET_REPLY', ticketId);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.groupedCount).toBe(2);
    expect(replies[0]?.link).toBe(`/portal/tickets/${ticketId}`);
  });

  it('the client’s reply reaches the assignee; read state is per person', async () => {
    await api()
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', bearer(support))
      .send({ assignedToId: developer.body.user.id })
      .expect(201);
    await api()
      .post(`/api/v1/portal/tickets/${ticketId}/reply`)
      .set('Authorization', bearer(clientAdmin))
      .send({ body: 'It is a Zebra DS2208.' })
      .expect(201);
    const forDeveloper = ofEntity(await inbox(developer, true), 'TICKET_REPLY', ticketId);
    expect(forDeveloper).toHaveLength(1);
    const read = await api()
      .post(`/api/v1/notifications/${forDeveloper[0]?.id}/read`)
      .set('Authorization', bearer(developer))
      .expect(201);
    expect(ofEntity(await inbox(developer, true), 'TICKET_REPLY', ticketId)).toHaveLength(0);
    expect(typeof read.body.unreadCount).toBe('number');
    await api()
      .post(`/api/v1/notifications/${forDeveloper[0]?.id}/read`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);
    const all = await api()
      .post('/api/v1/notifications/read-all')
      .set('Authorization', bearer(clientAdmin))
      .expect(201);
    expect(all.body.unreadCount).toBe(0);
    expect(await inbox(clientAdmin, true)).toHaveLength(0);
  });

  it('a person can switch a type off; in-app is on by default', async () => {
    const before = await api()
      .get('/api/v1/notifications/preferences')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(before.body.entries).toEqual([]);
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(clientAdmin))
      .send({ entries: [{ type: 'TICKET_REPLY', channel: 'IN_APP', enabled: false }] })
      .expect(200);
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(support))
      .send({ body: 'Thanks — a firmware update fixes that model.', visibility: 'CLIENT' })
      .expect(201);
    expect(ofEntity(await inbox(clientAdmin, true), 'TICKET_REPLY', ticketId)).toHaveLength(0);
    const restored = await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(clientAdmin))
      .send({ entries: [{ type: 'TICKET_REPLY', channel: 'IN_APP', enabled: true }] })
      .expect(200);
    expect(restored.body.entries).toEqual([
      { type: 'TICKET_REPLY', channel: 'IN_APP', enabled: true },
    ]);
    const audits = await prisma.auditLog.count({
      where: { action: 'notification.preferences_changed', actorUserId: clientAdmin.body.user.id },
    });
    expect(audits).toBeGreaterThanOrEqual(2);
  });

  it('quiet hours defer delivery until the delivery job runs', async () => {
    const now = new Date();
    const clock = (date: Date) => date.toISOString().slice(11, 16);
    const start = clock(new Date(now.getTime() - 60 * 60_000));
    const end = clock(new Date(now.getTime() + 60 * 60_000));
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(support))
      .send({
        quietHoursEnabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
        timezone: 'UTC',
      })
      .expect(200);
    const raised = await api()
      .post('/api/v1/portal/tickets')
      .set('Authorization', bearer(clientAdmin))
      .send({
        title: `Quiet hours ${stamp}`,
        description: 'Printer offline.',
        type: 'SUPPORT',
        priority: 'LOW',
        projectId,
      })
      .expect(201);
    const quietTicketId = raised.body.id as string;
    expect(ofEntity(await inboxRaw(support), 'TICKET_NEW', quietTicketId)).toHaveLength(0);
    const deferred = await prisma.notification.findFirst({
      where: { userId: support.body.user.id, entityId: quietTicketId, deliveredAt: null },
    });
    expect(deferred?.deliverAfter).not.toBeNull();
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(support))
      .send({ quietHoursEnabled: false })
      .expect(200);
    // The job delivers only when the deferral has ended; pretend it has.
    await prisma.notification.update({
      where: { id: deferred?.id ?? '' },
      data: { deliverAfter: new Date(now.getTime() - 1000) },
    });
    const job = await api()
      .post('/api/v1/notifications/jobs/deliver')
      .set('Authorization', bearer(director))
      .expect(201);
    expect(job.body.delivered).toBeGreaterThanOrEqual(1);
    expect(ofEntity(await inbox(support, true), 'TICKET_NEW', quietTicketId)).toHaveLength(1);
  });

  it('the daily reminders job never sends the same reminder twice', async () => {
    const first = await api()
      .post('/api/v1/notifications/jobs/reminders')
      .set('Authorization', bearer(director))
      .expect(201);
    const countAfterFirst = await prisma.notification.count({
      where: {
        type: {
          in: [
            'TASK_OVERDUE',
            'TASK_DUE_SOON',
            'CONTRACT_EXPIRY',
            'CONTRACT_RENEWAL',
            'SUPPORT_HOURS_LOW',
          ],
        },
      },
    });
    const second = await api()
      .post('/api/v1/notifications/jobs/reminders')
      .set('Authorization', bearer(director))
      .expect(201);
    const countAfterSecond = await prisma.notification.count({
      where: {
        type: {
          in: [
            'TASK_OVERDUE',
            'TASK_DUE_SOON',
            'CONTRACT_EXPIRY',
            'CONTRACT_RENEWAL',
            'SUPPORT_HOURS_LOW',
          ],
        },
      },
    });
    expect(first.body).toEqual(expect.objectContaining({ overdue: expect.any(Number) }));
    expect(
      second.body.overdue + second.body.dueSoon + second.body.expiries + second.body.lowHours,
    ).toBe(0);
    expect(countAfterSecond).toBe(countAfterFirst);
    await api()
      .post('/api/v1/notifications/jobs/reminders')
      .set('Authorization', bearer(support))
      .expect(403);
  });

  it('approvals and change requests notify both sides with the right links', async () => {
    const created = await api()
      .post('/api/v1/change-requests')
      .set('Authorization', bearer(pm))
      .send({
        clientOrganizationId: acmeId,
        requestedById: clientAdmin.body.user.id,
        title: `Notify CR ${stamp}`,
        description: 'Add a second till to the POS layout.',
        projectId,
      })
      .expect(201);
    const crId = created.body.id as string;
    for (const step of ['submit', 'start-internal-review', 'send-to-client']) {
      await api()
        .post(`/api/v1/change-requests/${crId}/${step}`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
    }
    await flush([clientAdmin]);
    const clientItems = await inbox(clientAdmin, true);
    const status = ofEntity(clientItems, 'CHANGE_REQUEST_STATUS', crId);
    expect(status.length).toBeGreaterThanOrEqual(1);
    expect(status[0]?.link).toBe(`/portal/change-requests/${crId}`);
    const requested = clientItems.filter((item) => item.type === 'APPROVAL_REQUESTED');
    expect(requested.length).toBeGreaterThanOrEqual(1);
    expect(requested[0]?.link).toMatch(/^\/portal\/approvals\//);

    await api()
      .post(`/api/v1/portal/change-requests/${crId}/approve`)
      .set('Authorization', bearer(clientAdmin))
      .send({})
      .expect(201);
    const pmItems = await inbox(pm, true);
    expect(
      pmItems.filter((item) => item.type === 'APPROVAL_DECIDED').length,
    ).toBeGreaterThanOrEqual(1);
    expect(ofEntity(pmItems, 'CHANGE_REQUEST_STATUS', crId).length).toBeGreaterThanOrEqual(1);
    expect(ofEntity(await inbox(zenithAdmin), 'CHANGE_REQUEST_STATUS', crId)).toHaveLength(0);
  });

  it('pages the inbox: the cursor walks backwards into older rows and then ends', async () => {
    // Five rows of known age at the top of an inbox that already has history under them.
    const now = Date.now();
    await flush([support]);
    await prisma.notification.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        organizationId: support.body.user.organization.id,
        userId: support.body.user.id,
        type: 'TASK_ASSIGNED' as const,
        title: `Paging ${stamp} ${index}`,
        createdAt: new Date(now - index * 60_000),
        deliveredAt: new Date(now - index * 60_000),
      })),
    });

    const all = await inboxRaw(support);
    expect(all.length).toBeGreaterThanOrEqual(5);

    const pageOf = async (limit: number, cursor: string | null) =>
      (
        await api()
          .get(`/api/v1/notifications?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
          .set('Authorization', bearer(support))
          .expect(200)
      ).body as { items: NotificationItem[]; nextCursor: string | null };

    const first = await pageOf(2, null);
    expect(first.items.map((item) => item.id)).toEqual(all.slice(0, 2).map((item) => item.id));
    expect(first.nextCursor).toBe(all[1]?.id);

    const second = await pageOf(2, first.nextCursor);
    // Older rows, and none of the first page's: the cursor moved rather than restarting.
    expect(second.items.map((item) => item.id)).toEqual(all.slice(2, 4).map((item) => item.id));

    // Following the cursor to the end terminates, and no row is seen twice.
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await pageOf(25, cursor);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 40);
    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.slice(0, 5)).toEqual(all.slice(0, 5).map((item) => item.id));
  });

  it('saves a whole preference set in one write, storing exactly what was sent', async () => {
    const userId = pm.body.user.id;
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    // Every type on every channel — what the web used to send on every save. In-app stays on
    // throughout: this test is about the write, not about muting somebody mid-run.
    const entries: NotificationPreferenceEntry[] = ALL_NOTIFICATION_TYPES.flatMap((type, index) =>
      Object.values(NOTIFICATION_CHANNEL).map((channel) => ({
        type,
        channel,
        enabled: channel === NOTIFICATION_CHANNEL.IN_APP ? true : index % 2 === 0,
      })),
    );

    const saved = await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(pm))
      .send({ entries })
      .expect(200);
    expect(saved.body.entries).toHaveLength(entries.length);

    const stored = await prisma.notificationPreference.findMany({ where: { userId } });
    expect(stored).toHaveLength(entries.length);
    for (const entry of entries) {
      const row = stored.find((item) => item.type === entry.type && item.channel === entry.channel);
      expect(row?.enabled).toBe(entry.enabled);
    }

    // A later save of one entry updates that row and leaves the other eighty alone — which is
    // what the screens send now that they only send what changed.
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', bearer(pm))
      .send({ entries: [{ type: 'TASK_ASSIGNED', channel: 'WHATSAPP', enabled: false }] })
      .expect(200);
    const after = await prisma.notificationPreference.findMany({ where: { userId } });
    expect(after).toHaveLength(entries.length);
    expect(
      after.find((row) => row.type === 'TASK_ASSIGNED' && row.channel === 'WHATSAPP')?.enabled,
    ).toBe(false);
    expect(after.filter((row) => row.enabled).length).toBe(
      stored.filter((row) => row.enabled).length - 1,
    );

    await prisma.notificationPreference.deleteMany({ where: { userId } });
  });
});
