import type { INestApplication } from '@nestjs/common';
import type {
  DashboardResponse,
  DeveloperDashboard,
  ManagementDashboard,
  SeniorDashboard,
  SupportDashboard,
} from '@ashniva/types';
import request from 'supertest';

import { createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * A dashboard card promises that the number on it and the list it opens are the same rows.
 *
 * Every pair below is the KPI as the API computes it and the URL the web app navigates to
 * (apps/web/src/features/dashboard/card-links.ts). They are asserted against the seeded data as
 * a real signed-in user, because the bug this guards was invisible to unit tests: the count was
 * organization-wide while the list quietly filtered to "assigned to me".
 */
describe('Dashboard cards and the lists they link to (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (session: Session, path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

  const dashboard = async (session: Session): Promise<DashboardResponse> =>
    (await get(session, '/api/v1/dashboard')).body as DashboardResponse;

  /** The `total` the destination reports, which is counted over the filter before paging. */
  const totalAt = async (session: Session, path: string): Promise<number> => {
    const response = await get(session, path);
    return response.body.total as number;
  };

  describe('super admin (organization-wide counts)', () => {
    let session: Session;
    let kpis: ManagementDashboard['kpis'];

    beforeAll(async () => {
      session = await loginAs(app, DEMO.director);
      kpis = ((await dashboard(session)) as ManagementDashboard).kpis;
    });

    // The reported bug: the card said 3, the list said 0.
    it('opens every overdue task the card counted', async () => {
      const total = await totalAt(session, '/api/v1/tasks?view=all&overdue=true');
      expect(total).toBe(kpis.overdueTasks);
    });

    it('counts more than the caller’s own overdue tasks', async () => {
      // Guards the specific regression: the destination must not fall back to "assigned to me".
      const mine = await totalAt(session, '/api/v1/tasks?view=overdue');
      const all = await totalAt(session, '/api/v1/tasks?view=all&overdue=true');
      expect(all).toBeGreaterThanOrEqual(mine);
      expect(all).toBe(kpis.overdueTasks);
    });

    it('agrees on the total even when the results span several pages', async () => {
      const first = await get(session, '/api/v1/tasks?view=all&overdue=true&limit=1');
      expect(first.body.total).toBe(kpis.overdueTasks);

      // Walking the cursor must yield exactly `total` rows, so the count is not a page count.
      const seen = new Set<string>();
      let cursor: string | null = first.body.nextCursor as string | null;
      for (const task of first.body.items as { id: string }[]) {
        seen.add(task.id);
      }
      while (cursor) {
        const page = await get(
          session,
          `/api/v1/tasks?view=all&overdue=true&limit=1&cursor=${cursor}`,
        );
        expect(page.body.total).toBe(kpis.overdueTasks);
        for (const task of page.body.items as { id: string }[]) {
          seen.add(task.id);
        }
        cursor = page.body.nextCursor as string | null;
      }
      expect(seen.size).toBe(kpis.overdueTasks);
    });

    it('never returns a completed or cancelled task as overdue', async () => {
      const response = await get(session, '/api/v1/tasks?view=all&overdue=true&limit=100');
      const statuses = (response.body.items as { status: string }[]).map((task) => task.status);
      expect(statuses).not.toContain('COMPLETED');
      expect(statuses).not.toContain('CANCELLED');
    });

    it('applies the overdue filter before paging, not after', async () => {
      // One row per page: every page must still be overdue-only, which is only true when the
      // filter is part of the query rather than applied to a fetched page.
      const page = await get(session, '/api/v1/tasks?view=all&overdue=true&limit=1');
      for (const task of page.body.items as { isOverdue: boolean }[]) {
        expect(task.isOverdue).toBe(true);
      }
    });

    it.each([
      ['completedToday', '/api/v1/tasks?view=all&completedToday=true'],
      ['pendingReviews', '/api/v1/tasks?view=all&status=IN_REVIEW'],
      ['criticalTickets', '/api/v1/tickets?view=critical'],
      ['openTickets', '/api/v1/tickets?view=open'],
      ['slaAtRisk', '/api/v1/tickets?view=sla-at-risk'],
      ['slaBreached', '/api/v1/tickets?view=sla-breached'],
      ['contractsExpiring', '/api/v1/contracts?view=expiring'],
      ['approvalsWaitingClient', '/api/v1/approvals?view=waiting-client'],
    ])('opens the list behind the %s card', async (kpi, path) => {
      expect(await totalAt(session, path)).toBe(kpis[kpi as keyof typeof kpis]);
    });

    it('opens the open change requests the card counted', async () => {
      const response = await get(
        session,
        '/api/v1/change-requests?status=DRAFT,SUBMITTED,INTERNAL_REVIEW,CLIENT_REVIEW,APPROVED,SCHEDULED,CHANGES_REQUESTED',
      );
      expect(response.body.total).toBe(kpis.openChangeRequests);
    });
  });

  describe('team lead', () => {
    let session: Session;
    let data: SeniorDashboard;

    beforeAll(async () => {
      session = await loginAs(app, DEMO.lead);
      data = (await dashboard(session)) as SeniorDashboard;
    });

    it('opens the team’s delayed work behind the Delayed card', async () => {
      expect(await totalAt(session, '/api/v1/tasks?view=team&overdue=true')).toBe(
        data.management.delayed,
      );
    });

    it('opens the lead’s own overdue work behind their own Overdue card', async () => {
      expect(await totalAt(session, '/api/v1/tasks?view=overdue')).toBe(data.own.overdue);
    });

    it.each([
      ['assignedByMe', '/api/v1/tasks?view=by-me'],
      ['underReview', '/api/v1/tasks?view=team&status=IN_REVIEW'],
      ['completedToday', '/api/v1/tasks?view=team&completedToday=true'],
    ])('opens the list behind the %s card', async (kpi, path) => {
      const expected = data.management[kpi as 'assignedByMe' | 'underReview' | 'completedToday'];
      expect(await totalAt(session, path)).toBe(expected);
    });
  });

  describe('developer', () => {
    let session: Session;
    let kpis: DeveloperDashboard['kpis'];

    beforeAll(async () => {
      session = await loginAs(app, DEMO.developer);
      kpis = ((await dashboard(session)) as DeveloperDashboard).kpis;
    });

    it.each([
      ['today', '/api/v1/tasks?view=today'],
      ['inProgress', '/api/v1/tasks?view=my&status=IN_PROGRESS'],
      ['overdue', '/api/v1/tasks?view=overdue'],
      ['completedToday', '/api/v1/tasks?view=done&completedToday=true'],
    ])('opens the list behind the %s card', async (kpi, path) => {
      expect(await totalAt(session, path)).toBe(kpis[kpi as keyof typeof kpis]);
    });

    it('keeps a developer’s overdue list to their own work', async () => {
      const response = await get(session, '/api/v1/tasks?view=overdue&limit=100');
      const assignees = (response.body.items as { assignedTo: { email: string } | null }[]).map(
        (task) => task.assignedTo?.email,
      );
      for (const email of assignees) {
        expect(email).toBe(DEMO.developer);
      }
    });
  });

  describe('support desk', () => {
    let session: Session;
    let kpis: SupportDashboard['kpis'];

    beforeAll(async () => {
      session = await loginAs(app, DEMO.support);
      kpis = ((await dashboard(session)) as SupportDashboard).kpis;
    });

    it.each([
      ['newTickets', '/api/v1/tickets?view=new'],
      ['assignedToMe', '/api/v1/tickets?view=mine'],
      ['inProgress', '/api/v1/tickets?view=open&status=IN_PROGRESS'],
      ['waitingForClient', '/api/v1/tickets?view=waiting'],
      ['critical', '/api/v1/tickets?view=critical'],
      ['resolvedToday', '/api/v1/tickets?view=resolved&resolvedToday=true'],
      ['slaAtRisk', '/api/v1/tickets?view=sla-at-risk'],
      ['slaBreached', '/api/v1/tickets?view=sla-breached'],
    ])('opens the list behind the %s card', async (kpi, path) => {
      expect(await totalAt(session, path)).toBe(kpis[kpi as keyof typeof kpis]);
    });
  });

  it('does not let a client user reach the internal task list with the new filter', async () => {
    const client = await loginAs(app, DEMO.clientAdmin);
    await request(app.getHttpServer())
      .get('/api/v1/tasks?view=all&overdue=true')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(403);
  });
});
