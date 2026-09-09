import type { Priority } from '../domain/priority';
import type { WorkRelationRole, WorkRelationType } from '../domain/work-relation';
import type { TaskStatus } from '../workflow/task-status';
import type { TicketStatus } from '../workflow/ticket-status';
import type { OrganizationRef, UserRef } from './identity';

/**
 * The other end of a relation, as much of it as the caller may read.
 *
 * A link is a disclosure: knowing that ticket A points at ticket B teaches the reader that B
 * exists, what it is called and whose it is. So the other end is only ever filled in when the
 * caller could have opened it directly, and the API decides that with the same rule that governs
 * reading it — see `relations/README.md`.
 */
export interface RelatedTicketRef {
  id: string;
  /** "T-<number>" */
  key: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  clientOrganization: OrganizationRef;
  assignedTo: UserRef | null;
}

export interface RelatedTaskRef {
  id: string;
  /** "<project code>-<number>" */
  key: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assignedTo: UserRef | null;
}

/**
 * One stored link, read from the point of view of the item that was asked about.
 *
 * `role` is computed on read rather than stored: the same row is "this is a duplicate of T-45" on
 * one screen and "T-52 is a duplicate of this" on the other.
 *
 * `other` is null when the row exists but its far end is not the caller's to see. Whether such a
 * row is shown redacted or dropped entirely is the API's decision and depends on who is asking —
 * a client is never shown even the shape of another client's ticket.
 */
export interface TicketRelationView {
  id: string;
  type: WorkRelationType;
  role: WorkRelationRole;
  note: string | null;
  linkedBy: UserRef | null;
  linkedAt: string;
  other: RelatedTicketRef | null;
}

export interface TaskRelationView {
  id: string;
  type: WorkRelationType;
  role: WorkRelationRole;
  note: string | null;
  linkedBy: UserRef | null;
  linkedAt: string;
  other: RelatedTaskRef | null;
}

export interface TicketRelationsResponse {
  relations: TicketRelationView[];
  /** Whether this caller may add or remove links here, so the screen can explain rather than hide. */
  canLink: boolean;
}

export interface TaskRelationsResponse {
  relations: TaskRelationView[];
  canLink: boolean;
}

export interface CreateTicketRelationInput {
  type: WorkRelationType;
  /** The other ticket. For a duplicate, the one being kept. */
  targetTicketId: string;
  note?: string;
  /**
   * Whether marking a duplicate also closes it, naming what it duplicates. Defaults to true.
   *
   * The closure is a status change with its own history entry, not a data migration: both tickets
   * keep every reply, attachment, SLA record and audit entry they had. Set it false to record the
   * pointer and leave the workflow alone.
   */
  closeDuplicate?: boolean;
}

export interface CreateTaskRelationInput {
  type: WorkRelationType;
  targetTaskId: string;
  note?: string;
}

/**
 * A ticket the duplicate matcher thinks is worth looking at, ready for the link dialog.
 *
 * These come from the fingerprint and keyword matcher the recurring-issues package already uses;
 * this shape is the subset the link dialog needs, plus whether the pair is already linked.
 */
export interface TicketRelationCandidate {
  ticketId: string;
  key: string;
  title: string;
  status: TicketStatus;
  clientOrganizationName: string;
  score: number;
  /** Plain phrases, ready to show: "module Billing", "error code ERR_PRN_TIMEOUT". */
  signals: string[];
  /** True when a relation already joins this pair, so the dialog offers nothing to do. */
  alreadyLinked: boolean;
}

export interface TicketRelationCandidatesResponse {
  candidates: TicketRelationCandidate[];
}
