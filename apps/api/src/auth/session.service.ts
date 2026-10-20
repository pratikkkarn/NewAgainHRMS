import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_MINUTES, REFRESH_GRACE_SECONDS, REFRESH_TOKEN_DAYS } from '@primestar/shared';
import type { Prisma } from '@primestar/db';
import type { Env } from '../config/env';
import { AppError } from '../common/app-error';
import { addDays, randomToken, sha256 } from '../common/crypto';
import type { RequestMeta } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUserService } from './auth-user.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

const SESSION_EXPIRED = (): AppError => new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');

/**
 * Sessions are rows in the Session table: one per refresh token, which is random and stored only
 * as a hash. The access token is a short-lived JWT that names the session it belongs to, so
 * revoking the session cuts it off.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: AuthUserService,
  ) {}

  async create(userId: string, meta: RequestMeta, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const refreshToken = randomToken();
    const session = await db.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: addDays(new Date(), REFRESH_TOKEN_DAYS),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { session, tokens: await this.tokensFor(userId, session.id, refreshToken) };
  }

  private async tokensFor(userId: string, sessionId: string, refreshToken: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_MINUTES * 60,
      },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_MINUTES * 60 };
  }

  /**
   * Swaps a refresh token for a new pair and retires the old one.
   *  - Two tabs refreshing together: the loser arrives inside the 30 second grace window and still
   *    gets a valid pair instead of being logged out.
   *  - A rotated token used again after the window means it was probably stolen, so every session
   *    of that user is revoked.
   */
  async rotate(refreshToken: string, meta: RequestMeta): Promise<{ userId: string; tokens: TokenPair }> {
    const old = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!old || old.expiresAt < new Date()) throw SESSION_EXPIRED();

    if (old.revokedAt) {
      const withinGrace = old.replacedById && Date.now() - old.revokedAt.getTime() <= REFRESH_GRACE_SECONDS * 1000;
      if (!withinGrace) {
        if (old.replacedById) await this.revokeAll(old.userId);
        throw SESSION_EXPIRED();
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: old.userId }, select: { status: true } });
    if (user?.status !== 'ACTIVE') throw SESSION_EXPIRED();

    const next = await this.prisma.$transaction(async (tx) => {
      // Only one of two simultaneous refreshes wins this update; the other falls through to the grace path.
      const claimed = await tx.session.updateMany({ where: { id: old.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const created = await this.create(old.userId, meta, tx);
      if (claimed.count === 1) await tx.session.update({ where: { id: old.id }, data: { replacedById: created.session.id } });
      return created;
    });
    this.users.invalidateSession(old.id);
    return { userId: old.userId, tokens: next.tokens };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.users.invalidateSession(sessionId);
  }

  /** Call after a transaction that changed the user has committed, so the guard reloads fresh data. */
  forgetUser(userId: string): void {
    this.users.invalidateUser(userId);
  }

  /** Signs a user out everywhere, optionally keeping one session (for "change password"). */
  async revokeAll(userId: string, exceptSessionId?: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    await db.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    this.users.invalidateUser(userId);
  }
}
