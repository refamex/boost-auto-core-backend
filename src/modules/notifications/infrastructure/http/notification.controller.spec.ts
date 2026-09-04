import 'reflect-metadata';
import { NotificationService } from '../../application/services/notification.service';
import { ROLES_KEY } from '../../../../shared/common/decorators/roles.decorator';
import { NotificationController } from './notification.controller';

describe('NotificationController', () => {
  const service = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  } as unknown as jest.Mocked<NotificationService>;

  beforeEach(() => jest.clearAllMocks());

  it('does not require a notification-specific role to list the session user notifications', () => {
    expect(Reflect.getMetadata(ROLES_KEY, NotificationController.prototype.list)).toBeUndefined();
  });

  it('passes the authenticated user id to the list service', () => {
    const controller = new NotificationController(service);
    const user = { id: 'session-user' } as never;
    const query = { page: 1, limit: 20 } as never;

    controller.list(user, query);

    expect(service.list).toHaveBeenCalledWith('session-user', query);
  });

  it('passes the authenticated user id when marking a notification as read', () => {
    const controller = new NotificationController(service);

    controller.markRead('notification-id', { id: 'session-user' } as never);

    expect(service.markRead).toHaveBeenCalledWith('notification-id', 'session-user');
  });
});