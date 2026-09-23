import type { RoleKey } from '../roles/role-keys';
import type { UserRef } from './identity';

/** One login or logout tick on the team session / break log. */
export type SessionLogEventKind = 'LOGIN' | 'LOGOUT';

export interface SessionLogEvent {
  id: string;
  kind: SessionLogEventKind;
  at: string;
  user: UserRef;
  roleKey: RoleKey | null;
  ipAddress: string | null;
}

/**
 * One desk session: login until logout (or still open).
 * `breakAfterSeconds` is idle time until the next login, when known.
 */
export interface SessionLogSession {
  id: string;
  user: UserRef;
  roleKey: RoleKey | null;
  loginAt: string;
  logoutAt: string | null;
  durationSeconds: number | null;
  breakAfterSeconds: number | null;
  stillOpen: boolean;
}

export interface SessionLogResponse {
  events: SessionLogEvent[];
  sessions: SessionLogSession[];
}
