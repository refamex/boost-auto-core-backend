import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgresSyncLock } from '../../shared/database/postgres-sync.lock';
import { SYNC_LOCK } from '../../shared/database/sync-lock';
import { NotificationListener } from './application/listeners/notification.listener';
import { NOTIFICATION_CHANNELS } from './application/ports/notification-channel';
import { NotificationService } from './application/services/notification.service';
import { OutboxDrainerService } from './application/services/outbox-drainer.service';
import { NotificationOutboxEntity } from './domain/entities/notification-outbox.entity';
import { NotificationEntity } from './domain/entities/notification.entity';
import { ConsoleEmailChannel } from './infrastructure/channels/console-email.channel';
import { InAppChannel } from './infrastructure/channels/inapp.channel';
import { NotificationController } from './infrastructure/http/notification.controller';
import { OutboxScheduler } from './infrastructure/scheduler/outbox.scheduler';

/**
 * Customer-facing notifications.
 *
 * This module imports nothing from orders, payments or shipping: it only
 * listens. Adding a trigger is a matter of emitting an event from wherever the
 * state actually changes, which for payment and shipping is not OrderService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity, NotificationOutboxEntity]),
  ],
  providers: [
    NotificationService,
    NotificationListener,
    OutboxDrainerService,
    OutboxScheduler,
    InAppChannel,
    ConsoleEmailChannel,
    { provide: SYNC_LOCK, useClass: PostgresSyncLock },
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inapp: InAppChannel, email: ConsoleEmailChannel) => [
        inapp,
        email,
      ],
      inject: [InAppChannel, ConsoleEmailChannel],
    },
  ],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationsModule {}
