import { Injectable } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  COMMUNICATION_ACTION,
  COMMUNICATION_REFUSAL,
  CONVERSATION_EVENTS,
  type AuthenticatedUser,
  type ConversationSubscribeAck,
  type PermissionKey,
} from '@ashniva/types';
import type { Socket } from 'socket.io';

import { REALTIME_PATH, roomForConversation } from '../../infrastructure/realtime/realtime-rooms';
import { OrganizationMembershipsRepository } from '../organization-memberships/organization-memberships.repository';
import { TokenService } from '../auth/token.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

interface SubscribePayload {
  conversationId?: unknown;
}

/**
 * Subscribing to a conversation, and being refused.
 *
 * A second gateway on the same Socket.IO path as the general one: connection, authentication and
 * the organization and user rooms are still `RealtimeGateway`'s job, and this adds the handlers
 * that need to know about conversations. Putting them there instead would make the realtime
 * infrastructure depend on a domain module, and this module already depends on it.
 *
 * **A subscription is not a grant.** Joining a conversation room is authorized here and refused
 * when it should be — which is the property requirement eighteen asks to be proved — but messages
 * are delivered to per-user rooms computed from live project membership at send time, so a socket
 * that stays joined after its owner leaves a project receives nothing. Both halves are needed: an
 * unauthorized subscribe must fail loudly, and an authorized one must not become permanent.
 */
@Injectable()
// CORS comes from RedisIoAdapter, not from here — see the note on RealtimeGateway.
@WebSocketGateway({ path: REALTIME_PATH })
export class CommunicationGateway {
  constructor(
    private readonly tokenService: TokenService,
    private readonly memberships: OrganizationMembershipsRepository,
    private readonly policy: CommunicationPolicyService,
    private readonly conversations: ConversationsRepository,
    private readonly conversationsService: ConversationsService,
  ) {}

  @SubscribeMessage(CONVERSATION_EVENTS.SUBSCRIBE)
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SubscribePayload,
  ): Promise<ConversationSubscribeAck> {
    const conversationId =
      typeof payload?.conversationId === 'string' ? payload.conversationId : '';
    const actor = await this.principal(socket);
    if (!actor || !conversationId) {
      return this.refuse(conversationId, COMMUNICATION_REFUSAL.NOT_INTERNAL);
    }

    const row = await this.conversations.find(actor.organizationId, conversationId);
    if (!row) {
      // The same answer a stranger's conversation gets, so subscribing cannot be used to find
      // out which ids exist.
      return this.refuse(conversationId, COMMUNICATION_REFUSAL.NOT_ON_PROJECT);
    }

    // The same context the HTTP read path builds, from the same function, so a socket and a
    // request cannot disagree about what this conversation is.
    const decision = await this.policy.decide(
      actor,
      COMMUNICATION_ACTION.READ,
      this.conversationsService.contextOf(row, actor.userId),
    );
    if (!decision.allowed) {
      return this.refuse(conversationId, decision.reason ?? COMMUNICATION_REFUSAL.NO_PERMISSION);
    }

    await socket.join(roomForConversation(conversationId));
    return { ok: true, conversationId, reason: null };
  }

  @SubscribeMessage(CONVERSATION_EVENTS.UNSUBSCRIBE)
  async unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SubscribePayload,
  ): Promise<ConversationSubscribeAck> {
    const conversationId =
      typeof payload?.conversationId === 'string' ? payload.conversationId : '';
    if (conversationId) {
      await socket.leave(roomForConversation(conversationId));
    }
    return { ok: true, conversationId, reason: null };
  }

  /**
   * Who this socket belongs to, rebuilt from the handshake token every time it is asked.
   *
   * The same shape the HTTP guard builds, and for the same reason: permissions and membership are
   * read now rather than carried on the connection, so a role change or a deactivation applies to
   * an open socket as immediately as it applies to a request.
   */
  private async principal(socket: Socket): Promise<AuthenticatedUser | null> {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      return null;
    }
    try {
      const claims = await this.tokenService.verifyAccessToken(token);
      const membership = await this.memberships.findActiveMembership(
        claims.sub,
        claims.organizationId,
      );
      if (!membership) {
        return null;
      }
      return {
        userId: claims.sub,
        organizationId: claims.organizationId,
        roleKey: (membership.role.templateKey ??
          membership.role.key) as AuthenticatedUser['roleKey'],
        permissions: membership.role.permissions.map(
          (entry) => entry.permission.key as PermissionKey,
        ),
        isServiceProvider: membership.organization.isServiceProvider,
      };
    } catch {
      return null;
    }
  }

  private refuse(conversationId: string, reason: ConversationSubscribeAck['reason']) {
    return { ok: false, conversationId, reason };
  }
}
