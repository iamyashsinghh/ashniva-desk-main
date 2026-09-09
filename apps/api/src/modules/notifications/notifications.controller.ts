import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type NotificationListResponse,
  type NotificationPreferences,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  ListNotificationsQueryDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

/** The signed-in person's notification center. Every route is scoped to the caller. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly processor: NotificationsProcessor,
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
