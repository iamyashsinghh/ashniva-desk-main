import { BadRequestException, Injectable } from '@nestjs/common';
import {
  COMMUNICATION_ACTION,
  type AuthenticatedUser,
  type ConversationCallSummary,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { CallLogsRepository } from '../call-logs/call-logs.repository';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationsService } from './conversations.service';

/** How many calls one thread shows. Older ones are oversight's business, not the composer's. */
const HISTORY_LIMIT = 50;

/**
 * The calls a conversation has carried.
 *
 * Two decisions are made here and they are deliberately different. *That* a call happened is
 * visible to everybody the conversation admits — hiding it would leave a thread with system
 * messages referring to nothing. *The audio* is a separate question, answered per call against the
 * playback permission and the organization's scope, and answered again by
 * `ConversationRecordingService` when somebody actually presses play. This service never hands
 * back a recording; it only says whether the button should be offered.
 */
@Injectable()
export class ConversationCallHistoryService {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly calls: CallLogsRepository,
    private readonly policy: CommunicationPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  async list(actor: AuthenticatedUser, conversationId: string): Promise<ConversationCallSummary[]> {
    const row = await this.conversationsService.load(actor, conversationId);
    const context = this.conversationsService.contextOf(row, actor.userId);
    await this.policy.require(actor, COMMUNICATION_ACTION.VIEW_CALL, context);

    const [rows, playback] = await Promise.all([
      this.prisma.callLog.findMany({
        where: { organizationId: actor.organizationId, conversationId: row.id },
        orderBy: { requestedAt: 'desc' },
        take: HISTORY_LIMIT,
        include: {
          initiatedBy: { select: { id: true, name: true, email: true } },
          participants: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      this.policy.decide(actor, COMMUNICATION_ACTION.PLAY_RECORDING, context),
    ]);

    return rows.map((call) => ({
      id: call.id,
      conversationId: call.conversationId,
      status: call.status,
      startedAt: call.requestedAt.toISOString(),
      endedAt: call.endedAt?.toISOString() ?? null,
      durationSeconds: call.durationSeconds,
      initiatedBy: call.initiatedBy,
      participants: call.participants.map((participant) => participant.user),
      hasRecording: call.recordingRef !== null,
      canPlayRecording: playback.allowed && call.recordingRef !== null,
    }));
  }

  /** One call, as its own thread shows it. Used to answer the request that started it. */
  async one(actor: AuthenticatedUser, callId: string): Promise<ConversationCallSummary> {
    const call = await this.calls.find(actor.organizationId, callId);
    if (!call?.conversationId) {
      throw new BadRequestException('The call could not be started');
    }
    const found = (await this.list(actor, call.conversationId)).find(
      (entry) => entry.id === callId,
    );
    if (!found) {
      throw new BadRequestException('The call could not be started');
    }
    return found;
  }
}
