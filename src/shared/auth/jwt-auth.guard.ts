import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from './jwt-payload.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  canActivate(ctx: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const mode = this.config.get('jwt.mode', { infer: true });
    if (mode === 'mock') {
      return this.attachMockUser(ctx);
    }

    return super.canActivate(ctx) as Promise<boolean>;
  }

  private attachMockUser(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      this.logger.warn('Mock auth: missing X-User-Id header');
      throw new UnauthorizedException('Missing X-User-Id (mock auth mode)');
    }

    const rolesHeader = req.headers['x-roles'];
    const roles =
      typeof rolesHeader === 'string'
        ? rolesHeader
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [];

    req.user = { id: userId, roles };
    return true;
  }
}
