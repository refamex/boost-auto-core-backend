import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../../../shared/common/pagination/pagination.dto';
import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import {
  NotificationContext,
  NotificationEventKey,
  dedupeKeyFor,
  linkFor,
  renderNotification,
} from '../../domain/notification-event';
import { NotificationQueryDto } from '../../infrastructure/http/dto/notification.dto';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from '../ports/notification-channel';

export interface CreateNotificationInput {
  eventKey: NotificationEventKey;
  recipientUserId: string;
  entityType: string;
  entityId: string;
  context: NotificationContext;
  /** Contact frozen on the source document, used to address the outbound channels. */
  contact?: { email?: string | null; phone?: string | null };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
    private readonly dataSource: DataSource,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
  ) {}

  /**
   * Records a notification and queues one delivery per enabled channel.
   *
   * Idempotent on the dedupe key: a redelivered webhook returns the existing
   * row instead of showing the customer the same message twice. The check is a
   * lookup rather than an upsert because the second caller must not re-queue
   * deliveries for a notification that was already fanned out.
   */
  async create(input: CreateNotificationInput): Promise<NotificationEntity> {
    const dedupeKey = dedupeKeyFor(
      input.eventKey,
      input.entityId,
      input.recipientUserId,
    );

    const existing = await this.repo.findOne({ where: { dedupeKey } });
    if (existing) {
      this.logger.debug(`Notification ${dedupeKey} already exists, skipping`);
      return existing;
    }

    const rendered = renderNotification(input.eventKey, input.context);

    return this.dataSource.transaction(async (tx) => {
      const notification = await tx.getRepository(NotificationEntity).save(
        tx.getRepository(NotificationEntity).create({
          recipientUserId: input.recipientUserId,
          category: rendered.category,
          eventKey: input.eventKey,
          title: rendered.title,
          body: rendered.body,
          link: linkFor(input.eventKey, input.entityId),
          entityType: input.entityType,
          entityId: input.entityId,
          dedupeKey,
        }),
      );

      const outboxRepo = tx.getRepository(NotificationOutboxEntity);
      const deliveries = this.channels
        .filter((c) => c.isEnabled())
        .map((c) => {
          const destination = c.resolveDestination(input.contact ?? {});
          // A channel with nothing to send to is skipped, not queued: retrying
          // an address that does not exist would burn attempts forever.
          const unreachable = c.name !== 'inapp' && !destination;
          return outboxRepo.create({
            notificationId: notification.id,
            channel: c.name,
            destination,
            status: unreachable ? 'skipped' : 'pending',
            lastError: unreachable ? 'no destination for channel' : null,
            attempts: 0,
            nextAttemptAt: new Date(),
          });
        });

      if (deliveries.length > 0) await outboxRepo.save(deliveries);
      return notification;
    });
  }

  async list(
    recipientUserId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    const [items, total] = await this.repo.findAndCount({
      where: {
        recipientUserId,
        ...(query.unreadOnly ? { readAt: IsNull() } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  unreadCount(recipientUserId: string): Promise<number> {
    return this.repo.count({ where: { recipientUserId, readAt: IsNull() } });
  }

  async markRead(
    id: string,
    recipientUserId: string,
  ): Promise<NotificationEntity> {
    // Scoped by recipient in the same query: a miss is a 404 whether the row is
    // absent or belongs to somebody else, so the endpoint leaks no existence.
    const found = await this.repo.findOne({ where: { id, recipientUserId } });
    if (!found) throw new NotFoundException(`Notification ${id} not found`);

    if (!found.readAt) {
      found.readAt = new Date();
      await this.repo.save(found);
    }
    return found;
  }

  async markAllRead(recipientUserId: string): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { recipientUserId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
