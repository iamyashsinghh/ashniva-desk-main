import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { REAUTH_HEADER, REFRESH_TOKEN_COOKIE, type SessionResponse } from '@ashniva/types';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!';

export const DEMO = {
  director: 'director@example.com',
  pm: 'pm@example.com',
  lead: 'lead@example.com',
  developer: 'developer@example.com',
  developer2: 'developer2@example.com',
  tester: 'tester@example.com',
  support: 'support@example.com',
  employee: 'employee@example.com',
  clientAdmin: 'client-admin@example.com',
  clientEmployee: 'client-employee@example.com',
  zenithAdmin: 'zenith-admin@example.com',
  zenithEmployee: 'zenith-employee@example.com',
} as const;

/**
 * The whole application, wired as it is in production.
 *
 * `customise` is for the one case a real request cannot reach: a collaborator this branch does not
 * have. `relations` uses it to bind a stub to the `TASK_SCOPE` token so the task-relation routes
 * can be asked what they do when the scope says no — the answer they will have to give once
 * `feat/task-visibility` supplies a real one. Prefer a real request every time; an override that
 * replaces something the branch *does* have is a test of the stub.
 */
export async function createTestApp(
  customise?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  const base = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (customise ? customise(base) : base).compile();
  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

export interface Session {
  accessToken: string;
  /** Raw `Cookie` header value carrying the refresh token. */
  cookie: string;
  body: SessionResponse;
}

/** Signs in through the real endpoint so tests exercise the same path as the apps. */
export async function loginAs(
  app: INestApplication,
  email: string,
  password = SEED_PASSWORD,
): Promise<Session> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const cookies = setCookieHeaders(response.headers['set-cookie']);
  const refreshCookie = cookies.find((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`));
  if (!refreshCookie) {
    throw new Error('Login did not set the refresh cookie');
  }
  return {
    accessToken: response.body.accessToken,
    cookie: refreshCookie.split(';')[0] ?? '',
    body: response.body as SessionResponse,
  };
}

function setCookieHeaders(header: string | string[] | undefined): string[] {
  if (Array.isArray(header)) {
    return header;
  }
  return header ? [header] : [];
}

export function bearer(session: Session): string {
  return `Bearer ${session.accessToken}`;
}

const reauthTokens = new Map<string, Promise<string>>();

/**
 * Headers for the routes that ask for the password again (role changes, creating people,
 * issuing invitations, editing roles, adjusting hours).
 *
 * Cached per session: `POST /auth/reauth` is throttled to ten calls a minute per client IP, and
 * in a test run every call comes from 127.0.0.1, so a suite that confirmed the password once for
 * each sensitive call would start answering 429 instead of testing anything. The token outlives
 * a suite (REAUTH_TTL_SECONDS), and the cache lives in this module, so it is per suite.
 */
export function reauthHeaders(
  app: INestApplication,
  session: Session,
  password = SEED_PASSWORD,
): Promise<Record<string, string>> {
  const cached = reauthTokens.get(session.accessToken);
  const token =
    cached ??
    request(app.getHttpServer())
      .post('/api/v1/auth/reauth')
      .set('Authorization', bearer(session))
      .send({ password })
      .expect(200)
      .then((response) => response.body.reauthToken as string);
  reauthTokens.set(session.accessToken, token);
  return token.then((value) => ({ [REAUTH_HEADER]: value }));
}
