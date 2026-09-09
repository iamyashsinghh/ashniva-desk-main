import { Injectable } from '@nestjs/common';
import { RedisAdapter } from '@socket.io/redis-adapter';
import type { EntityChangedEvent, NotificationEvent } from '@ashniva/types';

import { RealtimeGateway } from './realtime.gateway';
import {
  REALTIME_EVENTS,
  roomForOrganization,
  roomForProject,
  roomForUser,
} from './realtime-rooms';

type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/** What the readiness probe can say about the websocket layer. */
export interface RealtimeHealth {
  /** Socket.IO is attached to the HTTP server, so browsers can connect at all. */
  attached: boolean;
  /** Sockets currently connected to *this* instance. */
  connections: number;
  /**
   * Whether emits reach the other instances.
   *
   * False means this process is on Socket.IO's in-process adapter: correct with one instance,
   * and silently half-broken with more than one. Worth reporting rather than inferring from the
   * deployment, because the difference is invisible from the outside.
   */
  sharedAdapter: boolean;
}

/**
 * The only way domain modules talk to Socket.IO. Events are scoped to rooms: an organization
 * room (every signed-in member of that tenant), one project, or a single user. Nothing is
 * broadcast globally, so a client organization never receives another tenant's events.
 *
 * Prefer the narrowest room the event has. `emitToOrganization` wakes every signed-in colleague,
 * which is right for something that belongs to the whole tenant and wasteful for anything that
 * belongs to one project.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToOrganization(
    organizationId: string,
    event: RealtimeEvent,
    payload: EntityChangedEvent,
  ): void {
    this.gateway.server?.to(roomForOrganization(organizationId)).emit(event, payload);
  }

  /**
   * One project's room, falling back to the whole organization when the thing has no project.
   *
   * The fallback is not a formality: a ticket may be raised against a product rather than a
   * project, and those events still have to reach the people who triage them.
   */
  emitToProject(
    organizationId: string,
    projectId: string | null,
    event: RealtimeEvent,
    payload: EntityChangedEvent,
  ): void {
    const room = projectId ? roomForProject(projectId) : roomForOrganization(organizationId);
    this.gateway.server?.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: RealtimeEvent, payload: EntityChangedEvent): void {
    this.gateway.server?.to(roomForUser(userId)).emit(event, payload);
  }

  /**
   * One event to a named set of people, each in their own room.
   *
   * Used where the audience is *computed* rather than subscribed: package 9b works out who may
   * receive a conversation message from live project membership at send time, so a socket that
   * joined a room last week cannot receive today's message after its owner left the project.
   */
  emitToUsers(userIds: readonly string[], event: RealtimeEvent, payload: unknown): void {
    const server = this.gateway.server;
    if (!server) {
      return;
    }
    for (const userId of userIds) {
      server.to(roomForUser(userId)).emit(event, payload);
    }
  }

  /** A new (or newly grouped) notification for one person, with their unread badge count. */
  emitNotification(userId: string, payload: NotificationEvent): void {
    this.gateway.server?.to(roomForUser(userId)).emit(REALTIME_EVENTS.NOTIFICATION_NEW, payload);
  }

  /** The websocket layer's state, for the readiness probe and the metrics endpoint. */
  health(): RealtimeHealth {
    const server = this.gateway.server;
    if (!server) {
      return { attached: false, connections: 0, sharedAdapter: false };
    }
    const namespace = server.of('/');
    return {
      attached: true,
      connections: namespace.sockets.size,
      sharedAdapter: namespace.adapter instanceof RedisAdapter,
    };
  }
}
