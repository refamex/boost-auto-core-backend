import 'reflect-metadata';
import { NotificationService } from '../../application/services/notification.service';
import { ROLES_KEY } from '../../../../shared/common/decorators/roles.decorator';
import { NotificationController } from './notification.controller';

describe('NotificationController', () => {
  const list = jest.fn();
  const unreadCount = jest.fn();
  const markRead = jest.fn();
  const markAllRead = jest.fn();
  const service = {
    list,
    unreadCount,
    markRead,
    markAllRead,
  } as unknown as jest.Mocked<NotificationService>;

  beforeEach(() => jest.clearAllMocks());

  it('does not require a notification-specific role to list the session user notifications', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // Nest stores route metadata on the method function itself, so reading
        // it requires holding that reference. It is never called.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        NotificationController.prototype.list,
      ),
    ).toBeUndefined();
  });

  it('passes the authenticated user id to the list service', () => {
    const controller = new NotificationController(service);
    const user = { id: 'session-user' } as never;
    const query = { page: 1, limit: 20 } as never;

    void controller.list(user, query);

    expect(list).toHaveBeenCalledWith('session-user', query);
  });

  it('passes the authenticated user id when marking a notification as read', () => {
    const controller = new NotificationController(service);

    void controller.markRead('notification-id', {
      id: 'session-user',
    } as never);

    expect(markRead).toHaveBeenCalledWith('notification-id', 'session-user');
  });
});
