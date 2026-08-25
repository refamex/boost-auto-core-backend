import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from './jwt-payload.interface';
import { expand } from './role-permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const granted = expand(user.roles);
    const ok = required.some((r) => granted.has(r));
    if (!ok)
      throw new ForbiddenException(`Missing role(s): ${required.join(', ')}`);
    return true;
  }
}
