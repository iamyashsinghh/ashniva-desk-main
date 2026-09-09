import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';

import { REALTIME_PATH, roomForOrganization, roomForProject, roomForUser } from './realtime-rooms';
import { RealtimeRoomsRepository } from './realtime-rooms.repository';
import { TokenService } from '../../modules/auth/token.service';

/**
 * Socket.IO gateway. Clients connect with `auth: { token }`; the access token decides which
 * organization, user and project rooms the socket joins. Domain modules emit events through
 * RealtimeService.
 */
// No `cors` here: both gateways share one Socket.IO server on this path, so only one decorator's
// value would ever be used. RedisIoAdapter sets it from CORS_ORIGINS, the same list the HTTP layer
// honours — the previous `origin: true` reflected whatever origin asked.
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokenService: TokenService,
    private readonly rooms: RealtimeRoomsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RealtimeGateway.name);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.readToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const claims = await this.tokenService.verifyAccessToken(token);
      // The organization room is still joined: events that belong to a whole tenant — and every
      // event on something without a project — have nowhere narrower to go.
      //
      // The project rooms are what let ticket and SLA events stop going to everybody. A socket
      // joins only the projects its owner belonged to at connect time, which is a subset of what
      // the organization room already delivers, so nothing here widens what anyone receives: the
      // worst case of a room outliving a membership is that somebody keeps getting, until they
      // reconnect, exactly the events they used to get unconditionally. Anything that must be
      // decided at send time — conversation messages, package 9b — computes its recipients then
      // and uses per-user rooms instead.
      const projectIds = await this.rooms.projectIdsForUser(claims.organizationId, claims.sub);
      await socket.join([
        roomForOrganization(claims.organizationId),
        roomForUser(claims.sub),
        ...projectIds.map(roomForProject),
      ]);
      this.logger.debug(
        { userId: claims.sub, organizationId: claims.organizationId, projects: projectIds.length },
        'Socket connected',
      );
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug({ socketId: socket.id }, 'Socket disconnected');
  }

  private readToken(socket: Socket): string | undefined {
    const token = socket.handshake.auth?.token;
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }
}
