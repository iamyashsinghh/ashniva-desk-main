import type { AvailabilitySource, AvailabilityStatus, OnCallSource } from '../domain/availability';
import type { UserRef } from './identity';

/**
 * Who covers a project's support, when people work, and who is available now.
 *
 * The three shapes below are what the routing engine (package 8b) will read. They are separate
 * records because they change on completely different clocks: ownership when the team changes, a
 * schedule when somebody's contract changes, availability many times a day and mostly from Ashniva
 * HR. One table would have made every attendance ping rewrite the project's support configuration.
 */

/** A person's normal working week, as the API returns it. */
export interface WorkScheduleSummary {
  userId: string;
  user: UserRef;
  workingDays: number[];
  /** "09:30" — a clock time in `timezone`, not an instant. */
  startTime: string;
  endTime: string;
  timezone: string;
  /** How much open work this person may hold before the router stops adding to it. */
  workloadLimit: number | null;
  updatedAt: string;
}

/**
 * Whether somebody is available right now, and how Desk knows.
 *
 * `source` and `updatedAt` matter as much as `status`. An availability fact pushed by HR three
 * days ago is not evidence that somebody is at their desk, and the router has to be able to tell
 * the difference between "HR says they are working" and "nobody has said anything, so we fell back
 * to the rota".
 */
export interface AvailabilitySummary {
  userId: string;
  user: UserRef;
  status: AvailabilityStatus;
  source: AvailabilitySource;
  /** When the state stops applying — the end of a leave, say. Null means until it is replaced. */
  until: string | null;
  note: string | null;
  updatedAt: string;
}

/**
 * A person's availability with the schedule folded in.
 *
 * `effectiveStatus` is what the router should act on: a stored `AVAILABLE` from HR still means
 * out-of-hours if the person's rota says they finished two hours ago, and answering `AVAILABLE`
 * there would route a ticket to somebody who has gone home.
 */
export interface EffectiveAvailability extends AvailabilitySummary {
  effectiveStatus: AvailabilityStatus;
  /** True when the configured rota says this person should be working at this instant. */
  withinSchedule: boolean;
  schedule: WorkScheduleSummary | null;
}

/** One day of exceptional cover. */
export interface OnCallEntrySummary {
  id: string;
  projectId: string;
  /** The calendar date being covered, `YYYY-MM-DD`. */
  onDate: string;
  user: UserRef;
  backupUser: UserRef | null;
  source: OnCallSource;
  note: string | null;
}

/**
 * Who is responsible for a project's support, in the order the router will try them.
 *
 * The named roles are the §19.1 chain — module owner, then primary, then on-call, then backup.
 * `moduleOwners` is the first step of it: a map from a module or work area to the person who owns
 * it, so a ticket about billing reaches whoever owns billing rather than whoever is next.
 */
export interface SupportOwnershipSummary {
  projectId: string;
  primaryDeveloper: UserRef | null;
  backupDeveloper: UserRef | null;
  senior: UserRef | null;
  tester: UserRef | null;
  supportExecutive: UserRef | null;
  /** Work area or module → the person who owns it. Keys are matched case-insensitively. */
  moduleOwners: Record<string, string>;
  /** Open tickets one person may hold before the router skips them. Null means no limit. */
  workloadLimit: number | null;
  /** Minutes an assignee has to acknowledge before the ticket escalates. */
  ackMinutes: number;
  /** Minutes after that before it escalates again. */
  escalationMinutes: number;
  /** Ticket types that go straight to a developer rather than the support queue. */
  directTypes: string[];
  /** Whether the routing engine places tickets on this project at all. */
  autoRouteEnabled: boolean;
  /** Who hears about a ticket the chain could not place. Null means the support queue. */
  fallbackUser: UserRef | null;
  updatedAt: string;
}

/** Everything the configuration screen shows for one project. */
export interface ProjectSupportConfig {
  ownership: SupportOwnershipSummary;
  onCall: OnCallEntrySummary[];
  /** The project's members with their schedules and current availability, for the router preview. */
  team: EffectiveAvailability[];
}
