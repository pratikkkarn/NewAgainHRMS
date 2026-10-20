import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { AppError } from '../common/app-error';
import {
  ALLOW_PASSWORD_CHANGE,
  AUTH_ONLY,
  AuthUser,
  IS_PUBLIC,
  REQUIRED_ALL,
  REQUIRED_ANY,
} from '../common/decorators';
import { AuthUserService } from './auth-user.service';

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/**
 * The one guard every route goes through. It fails closed: a route with no access decorator
 * (@Public, @RequirePermission, @RequireAnyPermission or @AuthOnly) is refused, so a forgotten
 * decorator can never expose an endpoint.
 *
 * The token is read from the `access_token` cookie first and then the Bearer header, so moving
 * to httpOnly cookies later changes only the login response and the frontend client.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: AuthUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const read = <T>(key: string): T | undefined => this.reflector.getAllAndOverride<T>(key, targets);

    if (read<boolean>(IS_PUBLIC)) return true;

    const all = read<string[]>(REQUIRED_ALL);
    const any = read<string[]>(REQUIRED_ANY);
    const authOnly = read<boolean>(AUTH_ONLY);
    if (!all && !any && !authOnly) {
      const route = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.error(`${route} has no access decorator, refusing the request`);
      throw AppError.forbidden();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.readToken(request);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithms: ['HS256'],
      });
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    }

    const user = await this.users.load(payload.sub, payload.sid);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    request.user = user;

    if (user.mustChangePassword && !read<boolean>(ALLOW_PASSWORD_CHANGE)) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'You must set a new password before continuing.');
    }
    if (all && !all.every((permission) => user.permissions.has(permission))) throw AppError.forbidden();
    if (any && !any.some((permission) => user.permissions.has(permission))) throw AppError.forbidden();
    return true;
  }

  private readToken(request: Request): string | null {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    if (cookies?.['access_token']) return cookies['access_token'];
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
  }
}
