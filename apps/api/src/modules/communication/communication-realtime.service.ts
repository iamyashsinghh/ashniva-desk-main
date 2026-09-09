import { Injectable } from '@nestjs/common';
import type { ConversationCallSummary, MessageSummary } from '@ashniva/types';

import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { REALTIME_EVENTS } from '../../infrastructure/realtime/realtime-rooms';
import type { ConversationRow } from './conversations.repository';

/**
 * Delivering conversation events, to exactly the people entitled to them.
 *
 * The important decision in this file is what it does *not* do: it never emits to a conversation
 * room. Socket.IO rooms remember who joined, and remembering is the failure mode this whole
 * package is built to avoid — a developer removed from a project this morning is still in the
 * room they joined last week, and a room-wide emit would deliver to them.
 *
 * So every event is sent to the *per-user* rooms of an audience the caller recomputed from live
 * project membership a moment earlier. Subscribing to a conversation is still authorized and
 * still refused when it should be (see `CommunicationGateway`), but a subscription is a statement
 * of interest, never a grant. Losing your place on a project stops the messages arriving whether
 * or not you close the tab.
 */
@Injectable()
export class CommunicationRealtimeService {
  constructor(private readonly realtime: RealtimeService) {}

  messagePosted(row: ConversationRow, message: MessageSummary, audience: readonly string[]): void {
    this.realtime.emitToUsers(audience, REALTIME_EVENTS.CONVERSATION_MESSAGE, {
      conversationId: row.id,
      message,
    });
  }

  /** A message was rewritten. Its own event, so a client can tell a change from an arrival. */
  messageEdited(row: ConversationRow, message: MessageSummary, audience: readonly string[]): void {
    this.realtime.emitToUsers(audience, REALTIME_EVENTS.CONVERSATION_MESSAGE_EDITED, {
      conversationId: row.id,
      message,
    });
  }

  /** A message was withdrawn. The payload is the tombstone: no body, no attachments. */
  messageDeleted(row: ConversationRow, message: MessageSummary, audience: readonly string[]): void {
    this.realtime.emitToUsers(audience, REALTIME_EVENTS.CONVERSATION_MESSAGE_DELETED, {
      conversationId: row.id,
      message,
    });
  }

  /**
   * Somebody moved their own read cursor.
   *
   * Sent to that person and to nobody else. Two reasons, and the second is the one that decided
   * it: an unread badge that clears on the phone and stays lit on the laptop is a bug people
   * report, and who has read what is not the rest of the team's business — a read receipt is a
   * feature somebody would have to ask for, not a side effect of syncing a badge.
   */
  readUpdated(row: ConversationRow, readerId: string, readAt: Date): void {
    this.realtime.emitToUsers([readerId], REALTIME_EVENTS.CONVERSATION_READ, {
      conversationId: row.id,
      readAt: readAt.toISOString(),
    });
  }

  callUpdated(
    row: ConversationRow,
    call: ConversationCallSummary,
    audience: readonly string[],
  ): void {
    this.realtime.emitToUsers(audience, REALTIME_EVENTS.CONVERSATION_CALL, {
      conversationId: row.id,
      call,
    });
  }
}
