import type { INestApplication } from '@nestjs/common';
import { TASK_STATUS } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/** Projects, the task workflow, work logs, client updates and files. */
describe('Work: projects, tasks, work logs, client updates, files (e2e)', () => {
  let app: INestApplication;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let developer2: Session;
  let tester: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let acmeProjectId: string;
  let taskId = '';

  const api = () => request(app.getHttpServer());

  /**
   * Every task in a view, following the cursor to the end.
   *
   * A list endpoint's contract is "these tasks are in this view", not "these tasks are on the
   * first page of it", and the two only look the same while the database is nearly empty.
   *
   * The page size is deliberately small. Asking for a large page would make this pass today by
   * fitting every row into one response — which is the same fragility as before, just with a
   * higher ceiling — and would leave the cursor path untested until the day it was needed. At
   * ten, a development database with any history in it takes several pages, so the walk is
   * exercised on every run. The cap stops a runaway cursor from hanging the suite.
   */
  async function collectTasks(
    session: Session,
    view: string,
  ): Promise<{ id: string; status: string }[]> {
    const collected: { id: string; status: string }[] = [];
    let cursor: string | null = null;

    for (let requested = 0; requested < 500; requested += 1) {
      const query = `view=${view}&limit=10${cursor ? `&cursor=${cursor}` : ''}`;
      const response = await api()
        .get(`/api/v1/tasks?${query}`)
        .set('Authorization', bearer(session))
        .expect(200);

      const page = response.body as {
        items: { id: string; status: string }[];
        nextCursor: string | null;
      };
      collected.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) {
        return collected;
      }
    }
    throw new Error(`The ${view} view did not stop paging`);
  }

  const collectTaskIds = async (session: Session, view: string): Promise<string[]> =>
    (await collectTasks(session, view)).map((task) => task.id);

  beforeAll(async () => {
    app = await createTestApp();
    [pm, lead, developer, developer2, tester, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    const projects = await api()
      .get('/api/v1/projects')
      .set('Authorization', bearer(lead))
      .expect(200);
    acmeProjectId = projects.body.find((p: { code: string }) => p.code === 'ACM').id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('projects', () => {
    it('lists projects with counts and health for internal staff only', async () => {
      const response = await api()
        .get('/api/v1/projects')
        .set('Authorization', bearer(developer))
        .expect(200);
      const acme = response.body.find((p: { code: string }) => p.code === 'ACM');
      expect(acme.taskCounts.total).toBeGreaterThan(5);
      expect(['ON_TRACK', 'AT_RISK', 'DELAYED']).toContain(acme.health);
      expect(acme.clientOrganization.slug).toBe('acme-retail');
      await api().get('/api/v1/projects').set('Authorization', bearer(clientAdmin)).expect(403);
    });

    it('creates a project (project:manage) and rejects duplicates and outsiders', async () => {
      const code = `E${Date.now().toString().slice(-6)}`;
      const created = await api()
        .post('/api/v1/projects')
        .set('Authorization', bearer(pm))
        .send({
          code,
          name: 'E2E project',
          type: 'FIXED_PRICE',
          clientOrganizationId: clientAdmin.body.user.organization.id,
          leadUserId: lead.body.user.id,
        })
        .expect(201);
      expect(created.body.members.map((m: { email: string }) => m.email)).toContain(DEMO.lead);
      await api()
        .post('/api/v1/projects')
        .set('Authorization', bearer(pm))
        .send({ code, name: 'Dup', type: 'AMC' })
        .expect(409);
      await api()
        .patch(`/api/v1/projects/${created.body.id}`)
        .set('Authorization', bearer(developer))
        .send({ name: 'x' })
        .expect(403);
    });
  });

  describe('task workflow', () => {
    it('lead creates and assigns a task', async () => {
      const response = await api()
        .post('/api/v1/tasks')
        .set('Authorization', bearer(lead))
        .send({
          title: 'E2E: closing report rounding',
          projectId: acmeProjectId,
          assignedToId: developer.body.user.id,
          testerId: tester.body.user.id,
          priority: 'HIGH',
          clientVisible: true,
          dueDate: new Date().toISOString().slice(0, 10),
        })
        .expect(201);
      taskId = response.body.id;
      expect(response.body.status).toBe(TASK_STATUS.ASSIGNED);
      expect(response.body.key).toMatch(/^ACM-\d+$/);
      expect(response.body.history).toHaveLength(1);
      const start = response.body.actions.find((a: { action: string }) => a.action === 'start');
      expect(start.enabled).toBe(false);
      expect(start.reason).toBe('Only the assignee can do this');
    });

    it('developers can only assign to themselves', async () => {
      await api()
        .post('/api/v1/tasks')
        .set('Authorization', bearer(developer))
        .send({
          title: 'Not allowed',
          projectId: acmeProjectId,
          assignedToId: developer2.body.user.id,
        })
        .expect(403);
    });

    it('only the assignee can start; status jumps are refused', async () => {
      await api()
        .post(`/api/v1/tasks/${taskId}/start`)
        .set('Authorization', bearer(developer2))
        .expect(403);
      await api()
        .post(`/api/v1/tasks/${taskId}/submit`)
        .set('Authorization', bearer(developer))
        .send({ summary: 'too early', minutes: 10 })
        .expect(409);
      const started = await api()
        .post(`/api/v1/tasks/${taskId}/start`)
        .set('Authorization', bearer(developer))
        .expect(201);
      expect(started.body.status).toBe(TASK_STATUS.IN_PROGRESS);
      expect(started.body.startedAt).not.toBeNull();
    });

    it('the completion sheet records work and moves the task to review', async () => {
      const submitted = await api()
        .post(`/api/v1/tasks/${taskId}/submit`)
        .set('Authorization', bearer(developer))
        .send({
          summary: 'Fixed rounding in the closing report',
          minutes: 90,
          gitRef: 'PR #999',
          clientSummary: 'Closing report totals are now exact.',
        })
        .expect(201);
      expect(submitted.body.status).toBe(TASK_STATUS.IN_REVIEW);
      expect(submitted.body.loggedMinutes).toBe(90);
      expect(submitted.body.workLogs[0].gitRef).toBe('PR #999');
    });

    it('the assignee cannot review; the tester rejects with a comment', async () => {
      await api()
        .post(`/api/v1/tasks/${taskId}/review`)
        .set('Authorization', bearer(developer))
        .send({ outcome: 'APPROVE' })
        .expect(403);
      await api()
        .post(`/api/v1/tasks/${taskId}/review`)
        .set('Authorization', bearer(tester))
        .send({ outcome: 'REJECT' })
        .expect(400);
      const rejected = await api()
        .post(`/api/v1/tasks/${taskId}/review`)
        .set('Authorization', bearer(tester))
        .send({ outcome: 'REJECT', note: 'Refund rows are still off by one paisa' })
        .expect(201);
      expect(rejected.body.status).toBe(TASK_STATUS.RETURNED_TO_DEV);
      expect(rejected.body.comments.at(-1).body).toContain('Returned to developer');
    });

    it('resubmission and approval complete the task and queue a client update', async () => {
      await api()
        .post(`/api/v1/tasks/${taskId}/submit`)
        .set('Authorization', bearer(developer))
        .send({ summary: 'Rounding fixed for refunds too', minutes: 30 })
        .expect(201);
      const approved = await api()
        .post(`/api/v1/tasks/${taskId}/review`)
        .set('Authorization', bearer(tester))
        .send({ outcome: 'APPROVE' })
        .expect(201);
      expect(approved.body.status).toBe(TASK_STATUS.COMPLETED);
      expect(approved.body.completedAt).not.toBeNull();
      expect(approved.body.loggedMinutes).toBe(120);
      expect(approved.body.clientUpdate).toMatchObject({
        status: 'PENDING',
        body: 'Closing report totals are now exact.',
      });

      const prisma = app.get(PrismaService);
      const report = await prisma.dailyReport.findFirst({
        where: {
          userId: developer.body.user.id,
          reportDate: new Date(new Date().toISOString().slice(0, 10)),
        },
      });
      const snapshot = report?.snapshot as {
        items: Array<{ taskId: string; completedToday: boolean; minutes: number }>;
      };
      const item = snapshot.items.find((entry) => entry.taskId === taskId);
      expect(item).toMatchObject({ completedToday: true, minutes: 120 });
    });

    it('the client update waits until a senior publishes it', async () => {
      const pending = await api()
        .get('/api/v1/client-updates?status=PENDING')
        .set('Authorization', bearer(lead))
        .expect(200);
      const update = pending.body.find(
        (u: { task: { id: string } | null }) => u.task?.id === taskId,
      );
      expect(update).toBeDefined();
      await api()
        .post(`/api/v1/client-updates/${update.id}/publish`)
        .set('Authorization', bearer(developer))
        .expect(403);
      const published = await api()
        .post(`/api/v1/client-updates/${update.id}/publish`)
        .set('Authorization', bearer(lead))
        .expect(201);
      expect(published.body.status).toBe('PUBLISHED');
      expect(published.body.publishedBy.email).toBe(DEMO.lead);
    });

    it('views: completed tasks leave "my" and appear in "done"', async () => {
      // Both halves page through the whole view rather than reading the first page.
      //
      // The claim is "the task is in done and not in my", and a view is ordered by due date and
      // paginated — so on any installation carrying more than a page of history the task sits
      // wherever its due date puts it, which is usually not page one. Reading one page made the
      // presence check fail on a database with a real amount of work in it, and made the absence
      // check pass without meaning anything: a task still in `my` but on page two would have
      // satisfied it. Walking the pages tests the contract instead of the page size.
      const myIds = await collectTaskIds(developer, 'my');
      expect(myIds).not.toContain(taskId);

      const doneIds = await collectTaskIds(developer, 'done');
      expect(doneIds).toContain(taskId);

      const reviewIds = await collectTasks(tester, 'review');
      expect(reviewIds.every((t) => t.status === TASK_STATUS.IN_REVIEW)).toBe(true);
    });

    it('reopen and block/unblock follow the transition map', async () => {
      const reopened = await api()
        .post(`/api/v1/tasks/${taskId}/reopen`)
        .set('Authorization', bearer(lead))
        .send({ reason: 'Client found one more store affected' })
        .expect(201);
      expect(reopened.body.status).toBe(TASK_STATUS.REOPENED);
      const blocked = await api()
        .post(`/api/v1/tasks/${taskId}/block`)
        .set('Authorization', bearer(developer))
        .send({ reason: 'Waiting for store 4 data' })
        .expect(201);
      expect(blocked.body.blockedReason).toBe('Waiting for store 4 data');
      const unblocked = await api()
        .post(`/api/v1/tasks/${taskId}/unblock`)
        .set('Authorization', bearer(developer))
        .expect(201);
      expect(unblocked.body.status).toBe(TASK_STATUS.IN_PROGRESS);
      await api()
        .post(`/api/v1/tasks/${taskId}/cancel`)
        .set('Authorization', bearer(developer))
        .send({ reason: 'nope' })
        .expect(403);
    });

    it('clients never reach the internal task API', async () => {
      await api().get('/api/v1/tasks').set('Authorization', bearer(clientAdmin)).expect(403);
      await api()
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });
  });

  /**
   * Closing the loop back to the ticket the work came from.
   *
   * Converting a ticket into tasks used to be a one-way door: the tasks were completed and the
   * ticket sat wherever it was, so the support person watching it had no way of knowing short of
   * opening every linked task. The note says so. It is deliberately not a status change — whether
   * the client's problem is solved is theirs to judge, not a checklist's.
   */
  describe('a ticket learns that its work is finished', () => {
    async function convertAndComplete(taskTitles: string[]): Promise<string> {
      const ticket = await api()
        .post('/api/v1/tickets')
        .set('Authorization', bearer(clientAdmin))
        .send({
          title: 'Invoices export is empty',
          description: 'The monthly export downloads a zero-byte file.',
          type: 'BUG',
          priority: 'HIGH',
          projectId: acmeProjectId,
        })
        .expect(201);

      await api()
        .post(`/api/v1/tickets/${ticket.body.id}/convert`)
        .set('Authorization', bearer(pm))
        .send({
          projectId: acmeProjectId,
          tasks: taskTitles.map((title) => ({ title, assignedToId: developer.body.user.id })),
        })
        .expect(201);
      return ticket.body.id as string;
    }

    async function completeTask(id: string): Promise<void> {
      await api()
        .post(`/api/v1/tasks/${id}/start`)
        .set('Authorization', bearer(developer))
        .expect(201);
      await api()
        .post(`/api/v1/tasks/${id}/submit`)
        .set('Authorization', bearer(developer))
        .send({ minutes: 30, summary: 'Fixed the export query' })
        .expect(201);
      await api()
        .post(`/api/v1/tasks/${id}/review`)
        .set('Authorization', bearer(lead))
        .send({ outcome: 'APPROVE' })
        .expect(201);
    }

    const notes = (body: { history: Array<{ note: string | null }> }) =>
      body.history.map((row) => row.note);

    it('waits until every linked task is closed, then says so', async () => {
      const ticketId = await convertAndComplete(['Fix the export query', 'Add a regression test']);
      const detail = () =>
        api().get(`/api/v1/tickets/${ticketId}`).set('Authorization', bearer(pm)).expect(200);

      const linked = (await detail()).body.linkedTasks as Array<{ id: string }>;
      expect(linked).toHaveLength(2);

      await completeTask(linked[0]!.id);
      // One down, one to go: nothing is claimed yet.
      expect(notes((await detail()).body)).not.toContain('All linked work completed');

      await completeTask(linked[1]!.id);
      const finished = (await detail()).body;
      expect(notes(finished)).toContain('All linked work completed');
      // A note, not a decision: the ticket has not resolved itself.
      expect(finished.status).not.toBe('RESOLVED');
      expect(finished.status).not.toBe('CLOSED');
    });
  });

  describe('files', () => {
    /** The eight bytes every PNG starts with. */
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let internalFileId = '';
    let clientFileId = '';

    it('uploads an internal attachment to the task', async () => {
      const response = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(developer))
        .field('taskId', taskId)
        // The PNG signature, which is exactly eight bytes. `Buffer.from('fake-png')` was also
        // eight bytes and is now refused: an upload's declared content type is the client's word
        // for it, and the bytes have to agree (see file-rules.ts).
        .attach('file', PNG_SIGNATURE, {
          filename: 'screen shot.png',
          contentType: 'image/png',
        })
        .expect(201);
      internalFileId = response.body.id;
      expect(response.body).toMatchObject({
        name: 'screen shot.png',
        visibility: 'INTERNAL',
        sizeBytes: 8,
      });
      const download = await api()
        .get(`/api/v1/files/${internalFileId}/download`)
        .set('Authorization', bearer(lead))
        .expect(200);
      expect(download.headers['content-type']).toContain('image/png');
    });

    it('rejects disallowed types', async () => {
      await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(developer))
        .attach('file', Buffer.from('MZ'), {
          filename: 'tool.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(400);
    });

    it('clients only see client-visible files of their own work', async () => {
      await api()
        .get(`/api/v1/files/${internalFileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);
      const shared = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(lead))
        .field('taskId', taskId)
        .field('visibility', 'CLIENT')
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'release-notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      clientFileId = shared.body.id;
      await api()
        .get(`/api/v1/files/${clientFileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      await api()
        .get(`/api/v1/files/${clientFileId}/download`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(404);
      const listed = await api()
        .get(`/api/v1/files?taskId=${taskId}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(listed.body.map((f: { id: string }) => f.id)).toEqual([clientFileId]);
    });

    it('deletes an attachment', async () => {
      await api()
        .delete(`/api/v1/files/${internalFileId}`)
        .set('Authorization', bearer(developer))
        .expect(204);
      await api()
        .get(`/api/v1/files/${internalFileId}/download`)
        .set('Authorization', bearer(developer))
        .expect(404);
    });
  });

  describe('work logs', () => {
    it('everyone sees their own, leads their team, managers everyone', async () => {
      const own = await api()
        .get('/api/v1/work-logs')
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(
        own.body.every((log: { user: { email: string } }) => log.user.email === DEMO.developer),
      ).toBe(true);
      await api()
        .get(`/api/v1/work-logs?userId=${developer2.body.user.id}`)
        .set('Authorization', bearer(developer))
        .expect(403);
      const team = await api()
        .get(`/api/v1/work-logs?userId=${developer.body.user.id}`)
        .set('Authorization', bearer(lead))
        .expect(200);
      expect(team.body.length).toBeGreaterThan(0);
      const all = await api().get('/api/v1/work-logs').set('Authorization', bearer(pm)).expect(200);
      expect(
        new Set(all.body.map((log: { user: { email: string } }) => log.user.email)).size,
      ).toBeGreaterThan(1);
      await api().get('/api/v1/work-logs').set('Authorization', bearer(clientAdmin)).expect(403);
    });
  });

  /**
   * Scheduling and the timing indicator, which are the two halves of "when was this due and was it".
   *
   * Proved over HTTP rather than in the workflow unit test because the claim is about three layers
   * agreeing: the column stores the instant, the queue filter hides the task until its time, and
   * the endpoint refuses to start it early. A unit test can only speak for the third.
   */
  describe('scheduled work and timing', () => {
    const scheduledIds: string[] = [];

    const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

    async function scheduleTask(over: Record<string, unknown>): Promise<string> {
      const response = await api()
        .post('/api/v1/tasks')
        .set('Authorization', bearer(lead))
        .send({
          title: 'E2E: scheduled work',
          projectId: acmeProjectId,
          assignedToId: developer.body.user.id,
          workAreas: ['backend', 'API', 'api'],
          ...over,
        })
        .expect(201);
      scheduledIds.push(response.body.id);
      return response.body.id;
    }

    it('normalises and de-duplicates the work areas it was given', async () => {
      const id = await scheduleTask({ dueAt: inHours(6) });
      const detail = await api()
        .get(`/api/v1/tasks/${id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      // "backend" became "Backend"; "API" and "api" became one.
      expect(detail.body.workAreas).toEqual(['Backend', 'API']);
    });

    it('keeps a future task out of the working queue and refuses to start it', async () => {
      const id = await scheduleTask({ scheduledStartAt: inHours(4), dueAt: inHours(8) });

      const detail = await api()
        .get(`/api/v1/tasks/${id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(detail.body.isUpcoming).toBe(true);
      expect(detail.body.timing.status).toBe('IN_HAND');

      // Assigned, but not yet the developer's problem.
      expect(await collectTaskIds(developer, 'my')).not.toContain(id);
      expect(await collectTaskIds(developer, 'upcoming')).toContain(id);

      // And the API defends it, not just the queue: hiding the button is never the control.
      const refused = await api()
        .post(`/api/v1/tasks/${id}/start`)
        .set('Authorization', bearer(developer))
        .expect(409);
      expect(refused.body.message).toMatch(/scheduled to start later/i);
    });

    it('becomes workable the moment its time has passed, with no job to activate it', async () => {
      // A start time already behind us is the same state a scheduled task reaches on its own.
      const id = await scheduleTask({ scheduledStartAt: inHours(-1), dueAt: inHours(5) });

      const detail = await api()
        .get(`/api/v1/tasks/${id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(detail.body.isUpcoming).toBe(false);

      expect(await collectTaskIds(developer, 'my')).toContain(id);
      expect(await collectTaskIds(developer, 'upcoming')).not.toContain(id);

      await api()
        .post(`/api/v1/tasks/${id}/start`)
        .set('Authorization', bearer(developer))
        .expect(201);
    });

    it('reports a task past its expected completion as delayed while it is still open', async () => {
      const id = await scheduleTask({ dueAt: inHours(-3) });
      const detail = await api()
        .get(`/api/v1/tasks/${id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(detail.body.timing.status).toBe('DELAYED');
      expect(detail.body.timing.delayMinutes).toBeGreaterThanOrEqual(170);
    });

    it('leaves timing unanswered when nobody set an expected completion', async () => {
      const id = await scheduleTask({});
      const detail = await api()
        .get(`/api/v1/tasks/${id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(detail.body.timing.status).toBe('UNSCHEDULED');
      expect(detail.body.timing.delayMinutes).toBeNull();
    });
  });
});
