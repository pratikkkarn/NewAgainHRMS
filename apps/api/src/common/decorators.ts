import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@primestar/shared';

export const IS_PUBLIC = 'access:public';
export const REQUIRED_ALL = 'access:all';
export const REQUIRED_ANY = 'access:any';
export const AUTH_ONLY = 'access:auth-only';
export const ALLOW_PASSWORD_CHANGE = 'access:allow-password-change';

/** No login needed (login, forgot password, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** The user needs every one of these permissions. */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ALL, permissions);

/** The user needs at least one of these permissions. */
export const RequireAnyPermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ANY, permissions);

/** Any signed-in user, no specific permission (for example `GET /me`). */
export const AuthOnly = (): MethodDecorator & ClassDecorator => SetMetadata(AUTH_ONLY, true);

/** Lets a user who must change their password reach this route. */
export const AllowPasswordChange = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_PASSWORD_CHANGE, true);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  roles: { id: string; key: string; name: string }[];
  permissions: ReadonlySet<string>;
  mustChangePassword: boolean;
  sessionId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<{ user: AuthUser }>().user;
});

export interface RequestMeta {
  ip: string | undefined;
  userAgent: string | undefined;
}

export const Meta = createParamDecorator((_data: unknown, context: ExecutionContext): RequestMeta => {
  const request = context.switchToHttp().getRequest<{ ip?: string; headers: Record<string, string | undefined> }>();
  return { ip: request.ip, userAgent: request.headers['user-agent']?.slice(0, 300) };
});
