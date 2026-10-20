import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@primestar/db';
import { LOCKED_ROLES, ROLE_DEFAULTS, RoleKey, RoleLabel } from '@primestar/shared';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the real app against a real PostgreSQL database. It is skipped unless DATABASE_URL points at
 * localhost (the CI service container), so a stray run can never write to a shared database.
 * Set ALLOW_REMOTE_TEST_DB=1 to run it against a throwaway remote database on purpose.
 */
const dbUrl = process.env['DATABASE_URL'] ?? '';
const runnable = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env['ALLOW_REMOTE_TEST_DB'] === '1';

const PASSWORD = 'Test@12345';
const RUN = randomBytes(3).toString('hex');
const email = (name: string): string => `itest-${RUN}-${name}@primestar.test`;

describe.skipIf(!runnable)('auth, users and roles against a real database', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const mails: { to: string; template: string; params: Record<string, unknown> }[] = [];
  let ipCounter = 0;
  const roleId: Record<string, string> = {};

  // Each request pretends to come from its own IP, so the 10-a-minute login limit never gets in the way.
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, options: { token?: string; body?: object } = {}) => {
    const req = request(app.getHttpServer())[method](`/api${path}`).set('X-Forwarded-For', `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`);
    if (options.token) req.set('Authorization', `Bearer ${options.token}`);
    return options.body ? req.send(options.body) : req;
  };
  const login = (name: string, password = PASSWORD) => call('post', '/auth/login', { body: { email: email(name), password } });
  const tokenFor = async (name: string): Promise<string> => (await login(name)).body.accessToken as string;
  const mailLink = (template: string, to: string, param: 'invite' | 'reset'): string => {
    const mail = [...mails].reverse().find((m) => m.template === template && m.to === to);
    return new URL(String(mail?.params['link'])).searchParams.get(param) ?? '';
  };

  async function makeUser(name: string, role: string, status: 'ACTIVE' | 'INVITED' = 'ACTIVE') {
    const user = await prisma.user.create({
      data: {
        name: `ITest ${name}`,
        email: email(name),
        status,
        passwordHash: status === 'ACTIVE' ? await argon2.hash(PASSWORD, { type: argon2.argon2id }) : null,
        roles: { create: [{ roleId: roleId[role]! }] },
      },
    });
    return user;
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:3000',
      DIRECT_DATABASE_URL: process.env['DIRECT_DATABASE_URL'] ?? dbUrl,
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      CLOUDINARY_CLOUD_NAME: 'x',
      CLOUDINARY_API_KEY: 'x',
      CLOUDINARY_API_SECRET: 'x',
      MAIL_FROM: 'no-reply@example.com',
    });
    // Imported after the environment is set, because the config is validated when the app is built.
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { QueueService } = await import('../queue/queue.service.js');
    const { configureApp } = await import('../app.setup.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QueueService)
      .useValue({ enqueueMail: async (job: (typeof mails)[number]) => (mails.push(job), true) })
      .compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(nest, 1);
    await nest.init();
    app = nest;

    // The same roles the seed creates.
    for (const key of RoleKey.options) {
      const role = await prisma.role.upsert({
        where: { key },
        create: { key, name: RoleLabel[key], permissions: [...ROLE_DEFAULTS[key]], isSystem: true, isLocked: LOCKED_ROLES.includes(key) },
        update: {},
      });
      roleId[key] = role.id;
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `itest-${RUN}-` } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: `ITest ${RUN}` }, isSystem: false } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('signs a CEO in and reports their permissions', async () => {
    await makeUser('ceo', 'CEO');
    const res = await login('ceo');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.user.permissions).toEqual(expect.arrayContaining(['po.create', 'role.manage', 'invoice.override']));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|TokenHash/);
  });

  it('answers an unknown email and a wrong password identically', async () => {
    const unknown = await call('post', '/auth/login', { body: { email: email('ghost'), password: 'Wrong@12345' } });
    const wrong = await login('ceo', 'Wrong@12345');
    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('refuses requests with no token, a garbage token or a forged unsigned token', async () => {
    expect((await call('get', '/auth/me')).status).toBe(401);
    expect((await call('get', '/auth/me', { token: 'garbage' })).status).toBe(401);
    const forged = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x","sid":"y"}').toString('base64url')}.`;
    expect((await call('get', '/auth/me', { token: forged })).status).toBe(401);
  });

  it('runs the invite flow: create, accept once, weak passwords refused', async () => {
    const ceo = await tokenFor('ceo');
    const created = await call('post', '/users', { token: ceo, body: { name: 'New Person', email: email('invited'), roleIds: [roleId['EMPLOYEE']] } });
    expect(created.status).toBe(201);
    expect(created.body.user.status).toBe('INVITED');
    const token = mailLink('user-invite', email('invited'), 'invite');
    expect(token).not.toBe('');

    const weak = await call('post', '/auth/accept-invite', { body: { token, password: 'abc' } });
    expect(weak.status).toBe(400);
    expect(weak.body).toMatchObject({ code: 'VALIDATION_FAILED', field: 'password' });

    const accepted = await call('post', '/auth/accept-invite', { body: { token, password: PASSWORD } });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.email).toBe(email('invited'));
    expect((await call('post', '/auth/accept-invite', { body: { token, password: PASSWORD } })).body.code).toBe('TOKEN_INVALID');
  });

  it('returns the invite link outside production, and lets the set-password page check it first', async () => {
    const ceo = await tokenFor('ceo');
    const created = await call('post', '/users', { token: ceo, body: { name: 'Link Person', email: email('linkinfo'), roleIds: [roleId['EMPLOYEE']] } });
    expect(created.status).toBe(201);
    const token = new URL(created.body.devInviteLink).searchParams.get('invite') ?? '';
    expect(token.length).toBeGreaterThan(20);

    const info = await call('get', `/auth/link-info?kind=invite&token=${token}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ name: 'Link Person', email: email('linkinfo') });
    expect(JSON.stringify(info.body)).not.toMatch(/Hash/);

    // A reset check with an invite token, a made-up token and a malformed one are all refused.
    expect((await call('get', `/auth/link-info?kind=reset&token=${token}`)).body.code).toBe('TOKEN_INVALID');
    expect((await call('get', `/auth/link-info?kind=invite&token=${'x'.repeat(43)}`)).body.code).toBe('TOKEN_INVALID');
    expect((await call('get', '/auth/link-info?kind=invite&token=short')).status).toBe(400);
    expect((await call('get', `/auth/link-info?kind=other&token=${token}`)).status).toBe(400);

    expect((await call('post', '/auth/accept-invite', { body: { token, password: PASSWORD } })).status).toBe(200);
    const used = await call('get', `/auth/link-info?kind=invite&token=${token}`);
    expect(used.status).toBe(400);
    expect(used.body.code).toBe('TOKEN_INVALID');
  });

  it('shows the role list to people who manage settings, not to everyone', async () => {
    await makeUser('poadmin', 'PO_ADMIN');
    await makeUser('nobody', 'EMPLOYEE');
    expect((await call('get', '/roles', { token: await tokenFor('poadmin') })).status).toBe(200);
    expect((await call('get', '/roles', { token: await tokenFor('nobody') })).status).toBe(403);
  });

  it('rejects a duplicate email in any letter case', async () => {
    const ceo = await tokenFor('ceo');
    const res = await call('post', '/users', { token: ceo, body: { name: 'Dup', email: email('invited').toUpperCase(), roleIds: [roleId['EMPLOYEE']] } });
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('email');
  });

  it('locks an account on the 5th wrong password, even for the right password afterwards, until an admin unlocks', async () => {
    const target = await makeUser('lockme', 'EMPLOYEE');
    let last = await login('lockme', 'Wrong@12345');
    for (let i = 0; i < 4; i++) last = await login('lockme', 'Wrong@12345');
    expect(last.status).toBe(423);
    expect(last.body.code).toBe('ACCOUNT_LOCKED');
    expect((await login('lockme')).status).toBe(423);

    const ceo = await tokenFor('ceo');
    expect((await call('post', `/users/${target.id}/unlock`, { token: ceo })).status).toBe(200);
    expect((await login('lockme')).status).toBe(200);
  });

  it('rotates refresh tokens and treats reuse after the grace window as theft', async () => {
    await makeUser('rotate', 'EMPLOYEE');
    const first = (await login('rotate')).body;
    const second = await call('post', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(second.status).toBe(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);

    // Inside the grace window the old token still works, so two tabs refreshing together are fine.
    expect((await call('post', '/auth/refresh', { body: { refreshToken: first.refreshToken } })).status).toBe(200);

    // After the window it means the token leaked: the whole family is revoked.
    await prisma.session.updateMany({ where: { refreshTokenHash: { not: '' }, user: { email: email('rotate') }, replacedById: { not: null } }, data: { revokedAt: new Date(Date.now() - 120_000) } });
    expect((await call('post', '/auth/refresh', { body: { refreshToken: first.refreshToken } })).status).toBe(401);
    expect((await call('get', '/auth/me', { token: second.body.accessToken })).status).toBe(401);
    expect((await call('post', '/auth/refresh', { body: { refreshToken: second.body.refreshToken } })).status).toBe(401);
  });

  it('lets two simultaneous refreshes of one token both succeed', async () => {
    await makeUser('twotabs', 'EMPLOYEE');
    const session = (await login('twotabs')).body;
    const [a, b] = await Promise.all([
      call('post', '/auth/refresh', { body: { refreshToken: session.refreshToken } }),
      call('post', '/auth/refresh', { body: { refreshToken: session.refreshToken } }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('enforces permissions: 401 without a token, 403 without the permission', async () => {
    await makeUser('plain', 'EMPLOYEE');
    expect((await call('get', '/users')).status).toBe(401);
    const res = await call('get', '/users', { token: await tokenFor('plain') });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect((await call('get', '/audit', { token: await tokenFor('plain') })).status).toBe(403);
  });

  it('keeps the CEO role to CEOs, and stops people editing themselves', async () => {
    const hr = await makeUser('hr', 'HR_HEAD');
    const ceoUser = await prisma.user.findUniqueOrThrow({ where: { email: email('ceo') } });
    const hrToken = await tokenFor('hr');

    const giveCeo = await call('post', '/users', { token: hrToken, body: { name: 'Sneaky', email: email('sneaky'), roleIds: [roleId['CEO']] } });
    expect(giveCeo.status).toBe(422);
    expect(giveCeo.body.message).toMatch(/Only a CEO/);
    expect((await call('post', `/users/${ceoUser.id}/disable`, { token: hrToken })).status).toBe(422);
    const self = await call('patch', `/users/${hr.id}`, { token: hrToken, body: { name: 'Me' } });
    expect(self.status).toBe(422);
    expect(self.body.message).toMatch(/own access/);
  });

  it('never hands out permissions the giver does not hold, and never edits a locked role', async () => {
    const hrToken = await tokenFor('hr');
    const escalate = await call('post', '/roles', { token: hrToken, body: { name: `ITest ${RUN} escalate`, permissions: ['po.create'] } });
    expect(escalate.status).toBe(422);
    expect(escalate.body.message).toMatch(/po\.create/);

    const ceo = await tokenFor('ceo');
    const unknown = await call('post', '/roles', { token: ceo, body: { name: `ITest ${RUN} typo`, permissions: ['po.vieww'] } });
    expect(unknown.status).toBe(400);
    const locked = await call('patch', `/roles/${roleId['CEO']}`, { token: ceo, body: { permissions: [] } });
    expect(locked.status).toBe(422);
    expect(locked.body.message).toMatch(/locked/);
    expect((await call('delete', `/roles/${roleId['PO_ADMIN']}`, { token: ceo })).status).toBe(422);
  });

  it('creates, renames and deletes a custom role, but not while it is in use', async () => {
    const ceo = await tokenFor('ceo');
    const created = await call('post', '/roles', { token: ceo, body: { name: `ITest ${RUN} auditor`, permissions: ['audit.view', 'po.view'] } });
    expect(created.status).toBe(201);
    expect((await call('post', '/roles', { token: ceo, body: { name: `itest ${RUN} AUDITOR`, permissions: [] } })).status).toBe(409);

    const holder = await makeUser('holder', 'EMPLOYEE');
    await call('patch', `/users/${holder.id}`, { token: ceo, body: { roleIds: [created.body.id] } });
    const inUse = await call('delete', `/roles/${created.body.id}`, { token: ceo });
    expect(inUse.status).toBe(422);
    expect(inUse.body.message).toMatch(/still have this role/);

    await call('patch', `/users/${holder.id}`, { token: ceo, body: { roleIds: [roleId['EMPLOYEE']] } });
    expect((await call('delete', `/roles/${created.body.id}`, { token: ceo })).status).toBe(204);
  });

  it('ends a user\'s sessions at once when their roles change or they are disabled', async () => {
    const ceo = await tokenFor('ceo');
    const target = await makeUser('victim', 'EMPLOYEE');
    const session = await tokenFor('victim');
    expect((await call('get', '/auth/me', { token: session })).status).toBe(200);

    await call('patch', `/users/${target.id}`, { token: ceo, body: { roleIds: [roleId['EMPLOYEE'], roleId['PROJECT_MANAGER']] } });
    expect((await call('get', '/auth/me', { token: session })).status).toBe(401);

    const again = await tokenFor('victim');
    expect((await call('post', `/users/${target.id}/disable`, { token: ceo })).body.status).toBe('DISABLED');
    expect((await call('get', '/auth/me', { token: again })).status).toBe(401);
    const blocked = await login('victim');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect((await call('post', `/users/${target.id}/enable`, { token: ceo })).body.user.status).toBe('ACTIVE');
  });

  it('resets a password once through the emailed link and signs out older sessions', async () => {
    await makeUser('forgetful', 'EMPLOYEE');
    const older = await tokenFor('forgetful');
    const unknown = await call('post', '/auth/forgot', { body: { email: email('no-such-account') } });
    const known = await call('post', '/auth/forgot', { body: { email: email('forgetful') } });
    expect([unknown.status, known.status]).toEqual([202, 202]);
    expect(unknown.body.message).toBe(known.body.message);
    expect(unknown.body.devResetLink).toBeUndefined();
    expect(new URL(known.body.devResetLink).searchParams.get('reset')).toBeTruthy();
    expect(mails.some((m) => m.to === email('no-such-account'))).toBe(false);

    const token = mailLink('password-reset', email('forgetful'), 'reset');
    expect((await call('post', '/auth/reset', { body: { token, password: 'weak' } })).status).toBe(400);
    expect((await call('post', '/auth/reset', { body: { token, password: 'Brand@New99' } })).status).toBe(204);
    expect((await call('post', '/auth/reset', { body: { token, password: 'Another@99x' } })).status).toBe(400);
    expect((await login('forgetful')).status).toBe(401);
    expect((await login('forgetful', 'Brand@New99')).status).toBe(200);
    expect((await call('get', '/auth/me', { token: older })).status).toBe(401);
  });

  it('changes a password, signing out other devices but not this one', async () => {
    await makeUser('changer', 'EMPLOYEE');
    const a = await tokenFor('changer');
    const b = await tokenFor('changer');
    expect((await call('post', '/auth/change-password', { token: a, body: { currentPassword: 'Nope@12345', newPassword: 'Newer@12345' } })).status).toBe(401);
    expect((await call('post', '/auth/change-password', { token: a, body: { currentPassword: PASSWORD, newPassword: PASSWORD } })).status).toBe(400);
    expect((await call('post', '/auth/change-password', { token: a, body: { currentPassword: PASSWORD, newPassword: 'Newer@12345' } })).status).toBe(204);
    expect((await call('get', '/auth/me', { token: a })).status).toBe(200);
    expect((await call('get', '/auth/me', { token: b })).status).toBe(401);
  });

  it('blocks everything except /me, change-password and logout while a password change is required', async () => {
    const ceo = await tokenFor('ceo');
    const target = await makeUser('mustchange', 'HR_HEAD');
    expect((await call('post', `/users/${target.id}/require-password-change`, { token: ceo })).body.mustChangePassword).toBe(true);

    const session = (await login('mustchange')).body;
    expect(session.user.mustChangePassword).toBe(true);
    const blocked = await call('get', '/roles', { token: session.accessToken });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call('get', '/auth/me', { token: session.accessToken })).status).toBe(200);
    expect((await call('post', '/auth/change-password', { token: session.accessToken, body: { currentPassword: PASSWORD, newPassword: 'Final@12345' } })).status).toBe(204);
    expect((await call('get', '/roles', { token: session.accessToken })).status).toBe(200);
  });

  it('signs out on logout: the access and refresh tokens both stop working', async () => {
    await makeUser('leaver', 'EMPLOYEE');
    const session = (await login('leaver')).body;
    expect((await call('post', '/auth/logout', { token: session.accessToken })).status).toBe(204);
    expect((await call('get', '/auth/me', { token: session.accessToken })).status).toBe(401);
    expect((await call('post', '/auth/refresh', { body: { refreshToken: session.refreshToken } })).status).toBe(401);
  });

  it('keeps at least one active CEO when two CEOs disable each other at once', async (context) => {
    const others = await prisma.user.count({
      where: { status: 'ACTIVE', roles: { some: { role: { key: 'CEO' } } }, email: { not: { startsWith: `itest-${RUN}-` } } },
    });
    // On a shared database with real CEOs this scenario can't be set up, so it only runs on a clean one (CI).
    if (others > 0) return context.skip();

    const second = await makeUser('ceo2', 'CEO');
    const first = await prisma.user.findUniqueOrThrow({ where: { email: email('ceo') } });
    const [t1, t2] = [await tokenFor('ceo'), await tokenFor('ceo2')];
    const [a, b] = await Promise.all([
      call('post', `/users/${second.id}/disable`, { token: t1 }),
      call('post', `/users/${first.id}/disable`, { token: t2 }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    const active = await prisma.user.count({ where: { status: 'ACTIVE', roles: { some: { role: { key: 'CEO' } } } } });
    expect(active).toBeGreaterThanOrEqual(1);
  });

  it('records access events in the audit log with who, what and details', async () => {
    const ceo = await tokenFor('ceo');
    const res = await call('get', '/audit?pageSize=100', { token: ceo });
    expect(res.status).toBe(200);
    const actions = new Set<string>(res.body.items.map((i: { action: string }) => i.action));
    for (const action of ['User invited', 'Invite accepted', 'Account locked', 'Account unlocked', 'Roles changed', 'User disabled', 'Password reset', 'Password changed', 'Role created', 'Role deleted']) {
      expect(actions, action).toContain(action);
    }
    const entry = res.body.items.find((i: { action: string }) => i.action === 'Roles changed');
    expect(entry.actorName).not.toBe('System');
    expect(entry.target).toBeTruthy();
  });

  it('refuses to update or delete audit rows, even for the table owner', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it('answers errors in the standard shape', async () => {
    const ceo = await tokenFor('ceo');
    const missing = await call('get', '/nope', { token: ceo });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    expect((await call('get', '/users/not-a-uuid', { token: ceo })).status).toBe(400);
    const bad = await call('post', '/auth/login', { body: { email: 'not-an-email', password: 'x' } });
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED', field: 'email' });
    expect(bad.body.requestId).toBeTruthy();
  });

  it('limits login attempts per IP, then answers 429 in the standard shape', async () => {
    const statuses: number[] = [];
    let last: request.Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await request(app.getHttpServer()).post('/api/auth/login').set('X-Forwarded-For', '10.200.0.1').send({ email: email('ghost'), password: 'x' });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(last?.body.code).toBe('RATE_LIMITED');
  });
});
