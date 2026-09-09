import type { INestApplication } from '@nestjs/common';
import { TESTER_VIEW } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/**
 * Who may read whose task.
 *
 * Task visibility used to be the tenant and nothing else: `task:read` said a person works with
 * tasks, and the API answered "everybody's". A developer could list, open and edit any other
 * developer's work, with the internal comments, work-log text and proof URLs on it, and the same
 * breadth reached through the surfaces that carry a task's content — client updates, attachments,
 * git activity and the QA queue.
 *
 * Every assertion below is against the seeded organization as a real signed-in user, because the
 * hole was invisible to unit tests: each individual query was correctly tenant-scoped.
 *
 * The subject is `developer2`, who is on Acme POS, Zenith Fleet and the internal project, and is
 * on neither Acme Web Store nor GroupHR Payroll. `developer` is the mirror image — on the Web
 * Store and Payroll, off Zenith — so each of them has work the other must not be able to reach.
 */
describe('Task visibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let developer2: Session;
  let tester: Session;
  /** Somebody with no project membership at all, so "outside the caller's reach" is not a guess. */
  let stranger: Session;

  /** A task on a project the outsider is not a member of and is not named on. */
  let hiddenFromDeveloper2: { id: string; projectId: string };
  let hiddenFromDeveloper: { id: string; projectId: string };

  const api = () => request(app.getHttpServer());

  /** The id of the person a session belongs to. */
  const idOf = (session: Session) => session.body.user.id;

  async function taskOnProjectCode(code: string, awayFrom: string[]) {
    const row = await prisma.task.findFirst({
      where: {
        deletedAt: null,
        project: { code },
        assignedToId: { notIn: awayFrom },
        createdById: { notIn: awayFrom },
        AND: [
          { OR: [{ reviewerId: null }, { reviewerId: { notIn: awayFrom } }] },
          { OR: [{ testerId: null }, { testerId: { notIn: awayFrom } }] },
        ],
      },
      select: { id: true, projectId: true },
    });
    if (!row) {
      throw new Error(`The seed has no ${code} task away from ${awayFrom.join(', ')}`);
    }
    return row;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // One at a time, not `Promise.all`. Seven concurrent logins are seven argon2 verifications and
    // seven connection checkouts at once, against a pool of eleven — enough to exhaust it and
    // answer 500, which reads as a broken endpoint rather than as a crowded pool. Sign-in is not
    // what this suite is testing, so it should not be the thing that makes it flaky.
    [director, pm, lead, developer, developer2, tester, stranger] = [
      await loginAs(app, DEMO.director),
      await loginAs(app, DEMO.pm),
      await loginAs(app, DEMO.lead),
      await loginAs(app, DEMO.developer),
      await loginAs(app, DEMO.developer2),
      await loginAs(app, DEMO.tester),
      await loginAs(app, DEMO.employee),
    ];
    // ZEN is Zenith Fleet — `developer` is not a member of it.
    hiddenFromDeveloper = await taskOnProjectCode('ZEN', [idOf(developer)]);
    // ACW is the Acme Web Store — `developer2` is not a member of it.
    hiddenFromDeveloper2 = await taskOnProjectCode('ACW', [idOf(developer2)]);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('reading one task by id', () => {
    it('refuses a task on a project the caller has nothing to do with', async () => {
      // 404 rather than 403: an id must not be a probe for whether work exists.
      await api()
        .get(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(developer))
        .expect(404);
    });

    it('refuses the mirror image, so this is the scope and not one unlucky row', async () => {
      await api()
        .get(`/api/v1/tasks/${hiddenFromDeveloper2.id}`)
        .set('Authorization', bearer(developer2))
        .expect(404);
    });

    it('still opens a task on a project the caller is a member of', async () => {
      await api()
        .get(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(developer2))
        .expect(200);
    });

    it('opens every task for an organization-wide reader', async () => {
      for (const session of [director, pm]) {
        await api()
          .get(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
          .set('Authorization', bearer(session))
          .expect(200);
      }
    });
  });

  describe('the task list', () => {
    /** Every task id in a view, following the cursor to the end. */
    async function collect(session: Session, query: string): Promise<string[]> {
      const ids: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 100; page += 1) {
        const response = await api()
          .get(`/api/v1/tasks?${query}&limit=25${cursor ? `&cursor=${cursor}` : ''}`)
          .set('Authorization', bearer(session))
          .expect(200);
        const body = response.body as { items: { id: string }[]; nextCursor: string | null };
        ids.push(...body.items.map((item) => item.id));
        cursor = body.nextCursor;
        if (!cursor) {
          return ids;
        }
      }
      throw new Error('The list did not stop paging');
    }

    // The headline defect: `view=all` returned the organization.
    it('does not hand a developer another project’s work through view=all', async () => {
      const ids = await collect(developer, 'view=all');
      expect(ids).not.toContain(hiddenFromDeveloper.id);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('leaves an organization-wide reader’s view=all reaching the whole organization', async () => {
      const ids = await collect(pm, 'view=all');
      expect(ids).toContain(hiddenFromDeveloper.id);
      expect(ids).toContain(hiddenFromDeveloper2.id);
    });

    it('shows a developer strictly less than a manager sees', async () => {
      // Sequential, for the reason the logins in `beforeAll` are: each `collect` walks a cursor to
      // the end, so running two at once doubles the in-flight requests against one in-process
      // server and the connection is reset rather than answered. Nothing here needs concurrency.
      const mine = await collect(developer, 'view=all');
      const all = await collect(pm, 'view=all');
      expect(all.length).toBeGreaterThan(mine.length);
      for (const id of mine) {
        expect(all).toContain(id);
      }
    });

    it('narrows view=team to work the caller may actually see', async () => {
      const ids = await collect(developer, 'view=team');
      expect(ids).not.toContain(hiddenFromDeveloper.id);
    });

    it('refuses ?assignedToId= naming somebody outside the caller’s reach', async () => {
      // Refused rather than silently narrowed: an empty list is an answer, and a wrong one.
      await api()
        .get(`/api/v1/tasks?view=overdue&assignedToId=${idOf(stranger)}`)
        .set('Authorization', bearer(developer))
        .expect(403);
    });

    it.each(['upcoming', 'today', 'overdue', 'done'])(
      'refuses ?assignedToId= on the %s view too',
      async (view) => {
        await api()
          .get(`/api/v1/tasks?view=${view}&assignedToId=${idOf(stranger)}`)
          .set('Authorization', bearer(developer))
          .expect(403);
      },
    );

    it('lets an organization-wide reader filter by anybody', async () => {
      await api()
        .get(`/api/v1/tasks?view=overdue&assignedToId=${idOf(developer)}`)
        .set('Authorization', bearer(pm))
        .expect(200);
    });

    it('lets a caller filter by a colleague on their own project', async () => {
      await api()
        .get(`/api/v1/tasks?view=today&assignedToId=${idOf(lead)}`)
        .set('Authorization', bearer(developer))
        .expect(200);
    });
  });

  describe('the write path', () => {
    // `isManager` was `task:assign` and nothing else, so somebody who could not legitimately list
    // a task could still edit it by id. The scoped read is what stops that now.
    it('refuses a PATCH on a task outside the caller’s scope', async () => {
      await api()
        .patch(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(developer))
        .send({ title: 'Edited by somebody who cannot see it' })
        .expect(404);
    });

    it.each([
      ['assign', { assignedToId: null as unknown as string }],
      ['block', { reason: 'no' }],
      ['reopen', { reason: 'no' }],
      ['comments', { body: 'no' }],
    ])('refuses POST /%s on a task outside the caller’s scope', async (path, body) => {
      const response = await api()
        .post(`/api/v1/tasks/${hiddenFromDeveloper.id}/${path}`)
        .set('Authorization', bearer(developer))
        .send(path === 'assign' ? { assignedToId: idOf(developer) } : body);
      // 404 for the scope, or 400 when validation runs first — never a 200 or a 403 that would
      // mean the row was loaded.
      expect([400, 404]).toContain(response.status);
    });

    it('leaves the task untouched after a refused edit', async () => {
      const before = await prisma.task.findUnique({
        where: { id: hiddenFromDeveloper.id },
        select: { title: true },
      });
      await api()
        .patch(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(developer))
        .send({ title: 'Edited by somebody who cannot see it' })
        .expect(404);
      const after = await prisma.task.findUnique({
        where: { id: hiddenFromDeveloper.id },
        select: { title: true },
      });
      expect(after?.title).toBe(before?.title);
    });

    it('still lets a manager edit across the organization', async () => {
      const before = await prisma.task.findUnique({
        where: { id: hiddenFromDeveloper.id },
        select: { title: true },
      });
      await api()
        .patch(`/api/v1/tasks/${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(pm))
        .send({ title: before?.title ?? 'unchanged' })
        .expect(200);
    });
  });

  describe('the surfaces that carry a task’s content', () => {
    it('keeps the client-update queue inside the caller’s scope', async () => {
      const mine = await api()
        .get('/api/v1/client-updates')
        .set('Authorization', bearer(developer))
        .expect(200);
      const all = await api()
        .get('/api/v1/client-updates')
        .set('Authorization', bearer(pm))
        .expect(200);
      const projectsOf = (body: unknown) =>
        new Set((body as { project: { code: string } }[]).map((row) => row.project.code));
      // `GET /client-updates` is gated on `task:read` alone, so it used to be every developer's
      // window onto the whole organization's completed work.
      expect(projectsOf(all.body).size).toBeGreaterThanOrEqual(projectsOf(mine.body).size);
      expect(projectsOf(mine.body).has('ZEN')).toBe(false);
    });

    it('keeps a task’s attachments inside the caller’s scope', async () => {
      const response = await api()
        .get(`/api/v1/files?taskId=${hiddenFromDeveloper.id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('refuses to attach a new file to a task the caller cannot read', async () => {
      const response = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(developer))
        .field('taskId', hiddenFromDeveloper.id)
        .attach('file', Buffer.from('proof'), { filename: 'p.txt', contentType: 'text/plain' });
      expect([400, 404]).toContain(response.status);
    });

    it('keeps git activity inside the caller’s scope', async () => {
      const response = await api()
        .get(`/api/v1/tasks/${hiddenFromDeveloper.id}/activity`)
        .set('Authorization', bearer(developer))
        .expect(200);
      // Branch names, commit messages and pull-request titles are the developer's own words.
      expect(response.body).toEqual([]);
    });

    it('keeps the QA queue’s organization-wide views inside the caller’s scope', async () => {
      const outsiderProjects = new Set<string>();
      for (const view of [
        TESTER_VIEW.FAILED,
        TESTER_VIEW.RETEST,
        TESTER_VIEW.PASSED_TODAY,
        TESTER_VIEW.UAT,
        TESTER_VIEW.LIVE,
        TESTER_VIEW.OVERDUE,
      ]) {
        const response = await api()
          .get(`/api/v1/qa/assignments?view=${view}&limit=100`)
          .set('Authorization', bearer(tester))
          .expect(200);
        for (const row of response.body.queue as { project: { code: string } }[]) {
          outsiderProjects.add(row.project.code);
        }
      }
      // The tester is on ACM, ACW and ZEN, and not on GHR or ADK.
      expect(outsiderProjects.has('GHR')).toBe(false);
    });

    it('refuses a QA assignment on a task the caller cannot read', async () => {
      const assignment = await prisma.testingAssignment.findFirst({
        where: { deletedAt: null, task: { project: { code: 'ZEN' } } },
        select: { id: true },
      });
      if (!assignment) {
        return;
      }
      await api()
        .get(`/api/v1/qa/assignments/${assignment.id}`)
        .set('Authorization', bearer(developer))
        .expect(404);
    });

    it('keeps the tester dashboard’s reopened and awaiting lists inside the scope', async () => {
      const response = await api()
        .get('/api/v1/dashboard')
        .set('Authorization', bearer(tester))
        .expect(200);
      const body = response.body as {
        awaitingTesting: { project: { code: string } }[];
        reopened: { project: { code: string } }[];
      };
      // Both lists asked the organization a question rather than asking about the tester.
      for (const task of [...body.awaitingTesting, ...body.reopened]) {
        expect(['ACM', 'ACW', 'ZEN', 'ADK']).toContain(task.project.code);
      }
    });
  });

  describe('the client portal is untouched', () => {
    it('still refuses the internal task list to a client user', async () => {
      const client = await loginAs(app, DEMO.clientAdmin);
      await api().get('/api/v1/tasks?view=all').set('Authorization', bearer(client)).expect(403);
    });
  });
});
