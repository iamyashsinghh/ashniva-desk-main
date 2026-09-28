import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type NotificationListResponse,
  type NotificationPreferences,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppConfigService } from '../../config/app-config.service';
import {
  ListNotificationsQueryDto,
  SubscribePushDto,
  UnsubscribePushDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push-subscriptions.service';

/** The signed-in person's notification center. Every route is scoped to the caller. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly processor: NotificationsProcessor,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, newest first, with the unread count' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Badge count' })
  unreadCount(@CurrentUser() actor: AuthenticatedUser): Promise<{ unreadCount: number }> {
    return this.notifications.unreadCount(actor);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My per-type, per-channel preferences and quiet hours' })
  preferences(@CurrentUser() actor: AuthenticatedUser): Promise<NotificationPreferences> {
    return this.notifications.preferences(actor);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Save preferences and quiet hours' })
  updatePreferences(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(actor, dto);
  }

  @Get('push/vapid-public-key')
  @ApiOperation({ summary: 'VAPID public key for browser PushManager.subscribe' })
  vapidPublicKey(): { publicKey: string | null } {
    return { publicKey: this.config.webPush.publicKey ?? null };
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Register this browser for Web Push' })
  async subscribePush(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ ok: true }> {
    await this.pushSubscriptions.subscribe(actor, {
      endpoint: dto.endpoint,
      keys: dto.keys,
      userAgent: userAgent ?? null,
    });
    return { ok: true };
  }

  @Post('push/unsubscribe')
  @ApiOperation({ summary: 'Forget this browser Web Push subscription' })
  async unsubscribePush(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UnsubscribePushDto,
  ): Promise<{ ok: true }> {
    await this.pushSubscriptions.unsubscribe(actor, dto.endpoint);
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(actor, id);
  }

  @Post('jobs/deliver')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MANAGE)
  @ApiOperation({
    summary: 'Operator: deliver deferred notifications now (the queue does this every minute)',
  })
  deliverNow() {
    return this.processor.runDeliveries();
  }

  @Post('jobs/reminders')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Operator: run the daily reminders now (due dates, contracts, hours)' })
  remindersNow() {
    return this.processor.runReminders();
  }
}
