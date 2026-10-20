import { Injectable } from '@nestjs/common';
import type { Prisma } from '@primestar/db';
import {
  type ChangePasswordBody,
  type ForgotPasswordBody,
  type LoginBody,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  RESET_VALID_MINUTES,
  type SessionUser,
  type TokenPasswordBody,
} from '@primestar/shared';
import { AppError } from '../common/app-error';
import { addMinutes, sha256 } from '../common/crypto';
import type { AuthUser, RequestMeta } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LinkService } from './link.service';
import { PasswordService } from './password.service';
import { SessionService, type TokenPair } from './session.service';

export interface LoginResult extends TokenPair {
  user: SessionUser;
}

const BAD_CREDENTIALS = (): AppError => new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
const BAD_LINK = (): AppError =>
  new AppError('TOKEN_INVALID', 'This link is invalid or has expired. Ask an admin for a new one.');

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly links: LinkService,
    private readonly audit: AuditService,
  ) {}

  async login(body: LoginBody, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) throw this.lockedError(user.lockedUntil);

    // A missing user, or one who never set a password (still invited), looks exactly like a wrong password:
    // same message, and the same cost. A real wrong password spends an argon2 check plus one database
    // write (the failure counter), so a missing user spends an argon2 check plus one database round trip.
    if (!user?.passwordHash) {
      await this.passwords.verifyDummy(body.password);
      await this.prisma.$queryRaw`SELECT 1`;
      throw BAD_CREDENTIALS();
    }
    if (!(await this.passwords.verify(user.passwordHash, body.password))) {
      await this.recordFailure(user.id, user.name, meta);
      throw BAD_CREDENTIALS();
    }
    if (user.status === 'DISABLED') {
      throw new AppError('ACCOUNT_NOT_ACTIVE', 'This account is disabled. Contact an administrator.');
    }
    if (user.status !== 'ACTIVE') throw BAD_CREDENTIALS();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const { tokens } = await this.sessions.create(user.id, meta);
    return { ...tokens, user: await this.sessionUser(user.id) };
  }

  /** 5 wrong passwords lock the account for 15 minutes. The counter is incremented atomically. */
  private async recordFailure(userId: string, name: string, meta: RequestMeta): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < MAX_FAILED_LOGINS) return;

    const lockedUntil = addMinutes(new Date(), LOCK_MINUTES);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil } });
      await this.audit.access(
        tx,
        'Account locked',
        { id: userId, ip: meta.ip },
        { type: 'User', id: userId, name },
        `${MAX_FAILED_LOGINS} failed login attempts; locked for ${LOCK_MINUTES} minutes.`,
      );
    });
    throw this.lockedError(lockedUntil);
  }

  private lockedError(until: Date): AppError {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute(s).`);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<LoginResult> {
    const { userId, tokens } = await this.sessions.rotate(refreshToken, meta);
    return { ...tokens, user: await this.sessionUser(userId) };
  }

  logout(user: AuthUser): Promise<void> {
    return this.sessions.revoke(user.sessionId);
  }

  me(user: AuthUser): SessionUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      roles: user.roles,
      permissions: [...user.permissions].sort(),
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async sessionUser(userId: string): Promise<SessionUser> {
    const user: UserWithRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      roles: user.roles.map(({ role }) => ({ id: role.id, key: role.key, name: role.name })),
      permissions: [...new Set(user.roles.flatMap(({ role }) => role.permissions))].sort(),
      mustChangePassword: user.mustChangePassword,
    };
  }

  /** Always succeeds from the caller's side, so the reply never reveals whether the email exists. */
  async forgotPassword(body: ForgotPasswordBody): Promise<{ devResetLink?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (user?.status !== 'ACTIVE') return {};

    // One reset email a minute per account: stops someone flooding a user's inbox.
    const issuedAt = user.resetExpiresAt ? user.resetExpiresAt.getTime() - RESET_VALID_MINUTES * 60_000 : 0;
    if (Date.now() - issuedAt < 60_000) return {};

    const token = await this.links.issueReset(user.id);
    await this.links.queueReset(user, token);
    // Only present outside production, where no email is sent.
    return { devResetLink: this.links.devLink('reset', token) };
  }

  /**
   * Lets the set-password page say who the link is for, or why it is no good, before asking for a password.
   * The token is 256 random bits, so only the person it was sent to can ask.
   */
  async linkInfo(kind: 'invite' | 'reset', token: string): Promise<{ kind: string; name: string; email: string; expiresAt: Date }> {
    const hash = sha256(token);
    const user = await this.prisma.user.findUnique({
      where: kind === 'invite' ? { inviteTokenHash: hash } : { resetTokenHash: hash },
    });
    const expiresAt = kind === 'invite' ? user?.inviteExpiresAt : user?.resetExpiresAt;
    if (!user || !expiresAt) {
      throw new AppError('TOKEN_INVALID', 'This link is not valid or was already used. Ask for a new one.');
    }
    if (expiresAt < new Date()) throw new AppError('TOKEN_INVALID', 'This link has expired. Ask for a new one.');
    if (kind === 'invite' && user.status !== 'INVITED') throw new AppError('TOKEN_INVALID', 'This invite was already used.');
    if (kind === 'reset' && user.status !== 'ACTIVE') throw new AppError('TOKEN_INVALID', 'This account is disabled.');
    return { kind, name: user.name, email: user.email, expiresAt };
  }

  async resetPassword(body: TokenPasswordBody): Promise<void> {
    const hash = sha256(body.token);
    const user = await this.prisma.user.findUnique({ where: { resetTokenHash: hash } });
    if (!user?.resetExpiresAt || user.resetExpiresAt < new Date() || user.status !== 'ACTIVE') throw BAD_LINK();

    const passwordHash = await this.passwords.hash(body.password);
    await this.prisma.$transaction(async (tx) => {
      // The token is single use: only one request can clear it.
      const claimed = await tx.user.updateMany({
        where: { id: user.id, resetTokenHash: hash },
        data: {
          passwordHash,
          resetTokenHash: null,
          resetExpiresAt: null,
          failedLoginCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
        },
      });
      if (claimed.count !== 1) throw BAD_LINK();
      await this.sessions.revokeAll(user.id, undefined, tx);
      await this.audit.access(tx, 'Password reset', { id: user.id }, { type: 'User', id: user.id, name: user.name }, 'Password reset through the emailed link.');
    });
    this.sessions.forgetUser(user.id);
  }

  async acceptInvite(body: TokenPasswordBody, meta: RequestMeta): Promise<LoginResult> {
    const hash = sha256(body.token);
    const user = await this.prisma.user.findUnique({ where: { inviteTokenHash: hash } });
    if (!user?.inviteExpiresAt || user.inviteExpiresAt < new Date() || user.status !== 'INVITED') throw BAD_LINK();

    const passwordHash = await this.passwords.hash(body.password);
    const { tokens } = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: user.id, inviteTokenHash: hash, status: 'INVITED' },
        data: {
          passwordHash,
          status: 'ACTIVE',
          inviteTokenHash: null,
          inviteExpiresAt: null,
          mustChangePassword: false,
          lastLoginAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw BAD_LINK();
      await this.audit.access(tx, 'Invite accepted', { id: user.id }, { type: 'User', id: user.id, name: user.name }, 'Password set; account is now active.');
      return this.sessions.create(user.id, meta, tx);
    });
    return { ...tokens, user: await this.sessionUser(user.id) };
  }

  async changePassword(user: AuthUser, body: ChangePasswordBody, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row.passwordHash || !(await this.passwords.verify(row.passwordHash, body.currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect.', 'currentPassword');
    }
    if (await this.passwords.verify(row.passwordHash, body.newPassword)) {
      throw new AppError('VALIDATION_FAILED', 'Choose a password you have not used just now.', 'newPassword');
    }
    const passwordHash = await this.passwords.hash(body.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
      // Every other device is signed out; this one stays.
      await this.sessions.revokeAll(user.id, user.sessionId, tx);
      await this.audit.access(tx, 'Password changed', { id: user.id, ip: meta.ip }, { type: 'User', id: user.id, name: user.name }, 'Password changed by the user.');
    });
    // The cached copy still says "must change password".
    this.sessions.forgetUser(user.id);
  }
}
