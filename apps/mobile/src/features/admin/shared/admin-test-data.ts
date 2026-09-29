import type {
  AuditLogEntrySummary,
  CustomRoleDetail,
  HealthResponse,
  OrganizationOption,
  OrganizationSummary,
  PermissionCatalogEntry,
  UserSummary,
} from '@ashniva/types';

import { mobileEnv } from '../../../config/env';
import { jsonResponse } from '../../../shared/testing/harness';

/**
 * Records and a fake API for the administration screens' tests. Imported only by `*.test.tsx`
 * files, so none of it reaches the app bundle.
 */

export const OWN_ORG_ID = '22222222-2222-4222-8222-222222222222';
export const CLIENT_ORG_ID = '33333333-3333-4333-8333-333333333333';

export function company(over: Partial<OrganizationSummary> = {}): OrganizationSummary {
  return {
    id: CLIENT_ORG_ID,
    name: 'Acme Retail',
    slug: 'acme',
    type: 'CORPORATE_CUSTOMER',
    isServiceProvider: false,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    userCount: 4,
    projectCount: 2,
    openTicketCount: 3,
    createdAt: '2026-01-10T09:00:00.000Z',
    ...over,
  };
}

export const COMPANY_OPTIONS: OrganizationOption[] = [
  { id: OWN_ORG_ID, name: 'Ashniva', isServiceProvider: true },
  { id: CLIENT_ORG_ID, name: 'Acme Retail', isServiceProvider: false },
];

export function person(over: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 'user-asha',
    email: 'asha@example.com',
    name: 'Asha Rao',
    phone: null,
    status: 'ACTIVE',
    title: 'Backend developer',
    roleKey: 'DEVELOPER',
    roleId: 'role-dev',
    roleName: 'Developer',
    isCustomRole: false,
    showDevelopmentSection: true,
    organization: { id: OWN_ORG_ID, name: 'Ashniva', slug: 'ashniva' },
    teams: [{ id: 'team-web', name: 'Web team' }],
    lastLoginAt: '2026-09-20T09:00:00.000Z',
    createdAt: '2026-02-01T09:00:00.000Z',
    ...over,
  };
}

export function role(over: Partial<CustomRoleDetail> = {}): CustomRoleDetail {
  return {
    id: 'role-support',
    key: 'custom_support_lead',
    name: 'Support lead',
    description: 'Runs the support desk',
    isSystem: false,
    templateKey: 'SUPPORT_EXECUTIVE',
    audience: 'INTERNAL',
    permissions: ['ticket:read'],
    memberCount: 0,
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...over,
  };
}

export const CATALOG: PermissionCatalogEntry[] = [
  { key: 'ticket:read', description: 'View tickets', module: 'Tickets', clientAllowed: true },
  { key: 'ticket:triage', description: 'Triage tickets', module: 'Tickets', clientAllowed: false },
  { key: 'task:read', description: 'View tasks', module: 'Tasks', clientAllowed: false },
];

export function auditEntry(over: Partial<AuditLogEntrySummary> = {}): AuditLogEntrySummary {
  return {
    id: 'audit-1',
    action: 'user.role_changed',
    entityType: 'User',
    entityId: 'user-asha',
    actor: { id: 'admin-1', name: 'Priya Admin', email: 'priya@example.com' },
    organization: { id: OWN_ORG_ID, name: 'Ashniva', slug: 'ashniva' },
    before: { roleKey: 'DEVELOPER' },
    after: { roleKey: 'TEAM_LEAD' },
    ipAddress: '10.0.0.1',
    requestId: 'req-1',
    createdAt: '2026-09-21T10:30:00.000Z',
    ...over,
  };
}

export function health(over: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'up',
    version: '1.4.0',
    environment: 'production',
    timestamp: '2026-09-29T08:00:00.000Z',
    components: {
      database: { status: 'up', latencyMs: 4 },
      redis: { status: 'up', latencyMs: 2 },
      storage: { status: 'up', latencyMs: 30 },
      queues: { status: 'up' },
      realtime: { status: 'up' },
    },
    ...over,
  };
}

/** A non-2xx answer for a route. */
export class Reply {
  constructor(
    readonly body: unknown,
    readonly status: number,
  ) {}
}

export interface ApiCall {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * A fetch double answering by `"METHOD /path"` — the exact path, without the query string, so
 * `/roles/permissions` and `/roles/:id` cannot be confused. A route may be a function of the call,
 * to answer by query. Every call is recorded for assertions.
 * An unrouted read answers with an empty list, an unrouted write with an empty object.
 */
export function fakeApi(routes: Record<string, unknown>) {
  const calls: ApiCall[] = [];
  const fetchDouble = (input: unknown, init: RequestInit = {}) => {
    const url = String(input).replace(mobileEnv.apiBaseUrl, '');
    const [path = '', search = ''] = url.split('?');
    const query: Record<string, string> = {};
    for (const pair of search.split('&').filter(Boolean)) {
      const [key = '', value = ''] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const call: ApiCall = {
      method,
      path,
      query,
      headers: (init.headers ?? {}) as Record<string, string>,
      body,
    };
    calls.push(call);
    const key = `${method} ${path}`;
    const unrouted = method === 'GET' ? [] : {};
    const route = key in routes ? routes[key] : unrouted;
    const answer =
      typeof route === 'function' ? (route as (call: ApiCall) => unknown)(call) : route;
    return Promise.resolve(
      answer instanceof Reply ? jsonResponse(answer.body, answer.status) : jsonResponse(answer),
    );
  };
  const find = (method: string, path: string) =>
    calls.filter((call) => call.method === method && call.path === path);
  return { fetch: fetchDouble as unknown as typeof fetch, calls, find };
}
