import type { INestApplication } from '@nestjs/common';
import { ALL_REPORT_TYPES, CLIENT_REPORT_TYPES } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/**
 * Advanced reports: every report runs for a manager → CSV export is audited and escaped →
 * a team lead only gets team-scoped reports over their own people → clients get the
 * client-safe subset, pinned to their organization, without costs, assignees or first-response
 * performance → dashboards and the portal home carry the Phase 2 KPIs.
 */
describe('Advanced reports and dashboard extensions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  const api = () => request(app.getHttpServer());
  const from = '2026-01-01';
  const to = '2026-12-31';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, lead, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a manager can run every report and each one has columns, rows and totals', async () => {
    const available = await api()
      .get('/api/v1/reports/advanced')
      .set('Authorization', bearer(director))
      .expect(200);
    expect(available.body.map((item: { type: string }) => item.type)).toEqual([
      ...ALL_REPORT_TYPES,
    ]);
    for (const type of ALL_REPORT_TYPES) {
      const result = await api()
        .get(`/api/v1/reports/advanced/${type}?from=${from}&to=${to}`)
        .set('Authorization', bearer(director))
        .expect(200);
      expect(result.body.type).toBe(type);
      expect(result.body.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(result.body.rows)).toBe(true);
      expect(result.body.totals.length).toBeGreaterThan(0);
      for (const row of result.body.rows) {
        for (const column of result.body.columns) {
          expect(row).toHaveProperty(column.key);
        }
      }
    }
    await api()
      .get('/api/v1/reports/advanced/not-a-report')
      .set('Authorization', bearer(director))
      .expect(404);
    await api()
      .get(`/api/v1/reports/advanced/ticket-volume?from=${to}&to=${from}`)
      .set('Authorization', bearer(director))
      .expect(400);
  });

  /**
   * The support-hours report used to read the ledger with a findMany and an aggregate per
   * contract, in sequence; it now asks two grouped queries for the whole report. The numbers are
   * the point of the report, so they are asserted against the ledger rather than against a
   * snapshot of the previous implementation.
   */
  it('support hours reports the same totals the ledger holds', async () => {
    const report = await api()
      .get(`/api/v1/reports/advanced/support-hours?from=${from}&to=${to}`)
      .set('Authorization', bearer(director))
      .expect(200);
    expect(report.body.rows.length).toBeGreaterThan(0);

    for (const row of report.body.rows as Array<Record<string, number | string>>) {
      const contract = await prisma.contract.findFirstOrThrow({
        where: { numberLabel: String(row.number) },
      });
      const ledger = await prisma.contractHourLedger.findMany({
        where: {
          contractId: contract.id,
          periodStart: new Date(`${String(row.periodStart)}T00:00:00.000Z`),
        },
        select: { kind: true, minutes: true },
      });
      const sum = (kind: string) =>
        ledger.filter((entry) => entry.kind === kind).reduce((total, e) => total + e.minutes, 0);
      expect(row.includedMinutes).toBe(sum('INCLUDED'));
      expect(row.purchasedMinutes).toBe(sum('PURCHASED'));
      expect(row.carriedForwardMinutes).toBe(sum('CARRY_FORWARD'));
      expect(row.consumedMinutes).toBe(Math.abs(sum('CONSUMED')));
      expect(row.remainingMinutes).toBe(
        sum('INCLUDED') +
          sum('PURCHASED') +
          sum('CARRY_FORWARD') +
          sum('ADJUSTMENT') +
          sum('CONSUMED') +
          sum('RESERVED') +
          sum('RELEASED') +
          sum('EXPIRED'),
      );

      const inRange = await prisma.contractHourLedger.aggregate({
        where: {
          contractId: contract.id,
          kind: 'CONSUMED',
          createdAt: { gte: new Date(from), lt: new Date('2027-01-01T00:00:00.000Z') },
        },
        _sum: { minutes: true },
      });
      expect(row.consumedInRangeMinutes).toBe(Math.abs(inRange._sum.minutes ?? 0));
    }
  });

  it('the director sees contract value and cost; the PM sees value only', async () => {
    const asDirector = await api()
      .get(`/api/v1/reports/advanced/contract-status?from=${from}&to=${to}`)
      .set('Authorization', bearer(director))
      .expect(200);
    const directorKeys = asDirector.body.columns.map((column: { key: string }) => column.key);
    expect(directorKeys).toContain('contractValue');
    expect(directorKeys).toContain('internalCost');
    const asPm = await api()
      .get(`/api/v1/reports/advanced/contract-status?from=${from}&to=${to}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    const pmKeys = asPm.body.columns.map((column: { key: string }) => column.key);
    expect(pmKeys).toContain('contractValue');
    expect(pmKeys).not.toContain('internalCost');
    expect(JSON.stringify(asPm.body)).not.toContain('internalCost');
  });

  it('CSV export streams the same rows with escaping and is audited', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'report.exported' } });
    const response = await api()
      .get(`/api/v1/reports/advanced/project-progress/export?from=${from}&to=${to}`)
      .set('Authorization', bearer(director))
      .expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="project-progress-/,
    );
    const text = response.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toContain('Code,Project,Client,Status');
    const json = await api()
      .get(`/api/v1/reports/advanced/project-progress?from=${from}&to=${to}`)
      .set('Authorization', bearer(director))
      .expect(200);
    expect(lines.length - 1).toBe(json.body.rows.length);
    const after = await prisma.auditLog.count({ where: { action: 'report.exported' } });
    expect(after).toBe(before + 1);
    await api()
      .get(`/api/v1/reports/advanced/project-progress/export?from=${from}&to=${to}`)
      .set('Authorization', bearer(developer))
      .expect(403);
  });

  it('a team lead only gets team-scoped reports over their own people', async () => {
    const available = await api()
      .get('/api/v1/reports/advanced')
      .set('Authorization', bearer(lead))
      .expect(200);
    expect(available.body.map((item: { type: string }) => item.type).sort()).toEqual(
      ['task-completion', 'team-workload'].sort(),
    );
    await api()
      .get(`/api/v1/reports/advanced/contract-status?from=${from}&to=${to}`)
      .set('Authorization', bearer(lead))
      .expect(403);
    const workload = await api()
      .get(`/api/v1/reports/advanced/team-workload?from=${from}&to=${to}`)
      .set('Authorization', bearer(lead))
      .expect(200);
    const everyone = await api()
      .get(`/api/v1/reports/advanced/team-workload?from=${from}&to=${to}`)
      .set('Authorization', bearer(director))
      .expect(200);
    expect(workload.body.rows.length).toBeGreaterThan(0);
    expect(workload.body.rows.length).toBeLessThanOrEqual(everyone.body.rows.length);
    await api()
      .get(`/api/v1/reports/advanced/team-workload?userId=${pm.body.user.id}`)
      .set('Authorization', bearer(lead))
      .expect(403);
  });

  it('clients get the client-safe subset of their own organization, without internal data', async () => {
    const available = await api()
      .get('/api/v1/portal/reports')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(available.body.map((item: { type: string }) => item.type)).toEqual([
      ...CLIENT_REPORT_TYPES,
    ]);
    await api()
      .get(`/api/v1/portal/reports/team-workload?from=${from}&to=${to}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(403);
    await api()
      .get(`/api/v1/reports/advanced/project-progress?from=${from}&to=${to}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(403);

    const acmeId = clientAdmin.body.user.organization.id;
    const zenithId = zenithAdmin.body.user.organization.id;
    const contracts = await api()
      .get(
        `/api/v1/portal/reports/contract-status?from=${from}&to=${to}&clientOrganizationId=${zenithId}`,
      )
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    const keys = contracts.body.columns.map((column: { key: string }) => column.key);
    expect(keys).not.toContain('contractValue');
    expect(keys).not.toContain('internalCost');
    expect(contracts.body.filters.clientOrganizationId).toBe(acmeId);
    const clientNames = new Set(contracts.body.rows.map((row: { client: string }) => row.client));
    expect(clientNames.size).toBeLessThanOrEqual(1);

    const sla = await api()
      .get(`/api/v1/portal/reports/sla-performance?from=${from}&to=${to}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    const slaKeys = sla.body.columns.map((column: { key: string }) => column.key);
    expect(slaKeys).not.toContain('firstResponseStatus');
    expect(slaKeys).not.toContain('assignee');

    const projects = await api()
      .get(`/api/v1/portal/reports/project-progress?from=${from}&to=${to}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    const internalProjects = await prisma.project.findMany({
      where: { clientOrganizationId: { not: acmeId }, deletedAt: null },
      select: { code: true },
    });
    for (const project of internalProjects) {
      expect(projects.body.rows.map((row: { code: string }) => row.code)).not.toContain(
        project.code,
      );
    }
    const csv = await api()
      .get(`/api/v1/portal/reports/support-hours/export?from=${from}&to=${to}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('the management dashboard and portal home carry the Phase 2 KPIs', async () => {
    const dashboard = await api()
      .get('/api/v1/dashboard')
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(dashboard.body.kpis).toEqual(
      expect.objectContaining({
        contractsExpiring: expect.any(Number),
        approvalsWaitingClient: expect.any(Number),
        openChangeRequests: expect.any(Number),
        slaBreached: expect.any(Number),
      }),
    );
    const home = await api()
      .get('/api/v1/portal/home')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(home.body.kpis).toEqual(
      expect.objectContaining({
        pendingApprovals: expect.any(Number),
        openChangeRequests: expect.any(Number),
      }),
    );
    expect(Array.isArray(home.body.contracts)).toBe(true);
    expect(Array.isArray(home.body.pendingApprovals)).toBe(true);
    for (const contract of home.body.contracts) {
      expect(contract.internalNotes).toBeUndefined();
      expect(contract.internalCost).toBeUndefined();
    }
  });
});
