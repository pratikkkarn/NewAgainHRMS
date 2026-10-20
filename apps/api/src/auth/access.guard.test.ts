import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AppError } from '../common/app-error';
import {
  AllowPasswordChange,
  type AuthUser,
  AuthOnly,
  Public,
  RequireAnyPermission,
  RequirePermission,
} from '../common/decorators';
import { AccessGuard } from './access.guard';
import type { AuthUserService } from './auth-user.service';

const SECRET = 's'.repeat(40);

class Routes {
  @Public() open() {}
  @AuthOnly() anyone() {}
  @RequirePermission('po.edit', 'po.view') both() {}
  @RequireAnyPermission('po.edit', 'invoice.create') either() {}
  @AuthOnly() @AllowPasswordChange() allowedWhileChanging() {}
  forgotten() {}
}

const jwt = new JwtService();
const sign = (payload: object, secret = SECRET, algorithm: 'HS256' | 'HS384' = 'HS256') =>
  jwt.signAsync(payload, { secret, algorithm, expiresIn: 60 });

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    name: 'Test',
    email: 't@x.test',
    employeeId: null,
    roles: [],
    permissions: new Set<string>(),
    mustChangePassword: false,
    sessionId: 'sess-1',
    ...overrides,
  };
}

function guardFor(loaded: AuthUser | null) {
  const users = { load: async () => loaded } as unknown as AuthUserService;
  const config = { get: () => SECRET } as never;
  return new AccessGuard(new Reflector(), jwt, config, users);
}

function contextFor(route: keyof Routes, request: { headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
  const req = { headers: {}, cookies: {}, ...request } as Record<string, unknown>;
  const context = {
    getHandler: () => Routes.prototype[route],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

const bearer = async (payload = { sub: 'user-1', sid: 'sess-1' }) => ({ authorization: `Bearer ${await sign(payload)}` });

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe('AccessGuard', () => {
  it('lets public routes through without a token', async () => {
    expect(await guardFor(null).canActivate(contextFor('open').context)).toBe(true);
  });

  it('fails closed: a route with no access decorator is refused, even for a valid user', async () => {
    const { context } = contextFor('forgotten', { headers: await bearer() });
    expect(await codeOf(guardFor(user()).canActivate(context))).toBe('FORBIDDEN');
  });

  it('asks for a token', async () => {
    expect(await codeOf(guardFor(null).canActivate(contextFor('anyone').context))).toBe('UNAUTHENTICATED');
  });

  it('refuses garbage, a wrong secret and an unsigned token', async () => {
    const wrongSecret = await sign({ sub: 'user-1', sid: 'sess-1' }, 'x'.repeat(40));
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"user-1","sid":"sess-1"}').toString('base64url')}.`;
    for (const token of ['garbage', wrongSecret, unsigned]) {
      const { context } = contextFor('anyone', { headers: { authorization: `Bearer ${token}` } });
      expect(await codeOf(guardFor(user()).canActivate(context))).toBe('UNAUTHENTICATED');
    }
  });

  it('refuses a token signed with another algorithm', async () => {
    const token = await sign({ sub: 'user-1', sid: 'sess-1' }, SECRET, 'HS384');
    const { context } = contextFor('anyone', { headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guardFor(user()).canActivate(context))).toBe('UNAUTHENTICATED');
  });

  it('refuses a valid token whose session was revoked or whose user was disabled', async () => {
    const { context } = contextFor('anyone', { headers: await bearer() });
    expect(await codeOf(guardFor(null).canActivate(context))).toBe('UNAUTHENTICATED');
  });

  it('attaches the user and allows an authenticated-only route', async () => {
    const { context, req } = contextFor('anyone', { headers: await bearer() });
    expect(await guardFor(user()).canActivate(context)).toBe(true);
    expect((req['user'] as AuthUser).id).toBe('user-1');
  });

  it('needs every permission on @RequirePermission', async () => {
    const run = async (permissions: string[]) =>
      codeOf(guardFor(user({ permissions: new Set(permissions) })).canActivate(contextFor('both', { headers: await bearer() }).context));
    expect(await run(['po.edit'])).toBe('FORBIDDEN');
    expect(await run(['po.edit', 'po.view'])).toBeUndefined();
  });

  it('needs only one permission on @RequireAnyPermission', async () => {
    const run = async (permissions: string[]) =>
      codeOf(guardFor(user({ permissions: new Set(permissions) })).canActivate(contextFor('either', { headers: await bearer() }).context));
    expect(await run(['po.view'])).toBe('FORBIDDEN');
    expect(await run(['invoice.create'])).toBeUndefined();
  });

  it('blocks a user who must change their password, except on the routes that allow it', async () => {
    const pending = user({ mustChangePassword: true });
    expect(await codeOf(guardFor(pending).canActivate(contextFor('anyone', { headers: await bearer() }).context))).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
    expect(await guardFor(pending).canActivate(contextFor('allowedWhileChanging', { headers: await bearer() }).context)).toBe(true);
  });

  it('reads the access_token cookie before the Bearer header', async () => {
    const cookie = await sign({ sub: 'user-1', sid: 'sess-1' });
    const { context } = contextFor('anyone', { cookies: { access_token: cookie }, headers: { authorization: 'Bearer garbage' } });
    expect(await guardFor(user()).canActivate(context)).toBe(true);
  });
});
