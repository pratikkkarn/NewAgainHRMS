import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@primestar/db';
import { INVITE_VALID_DAYS, RESET_VALID_MINUTES } from '@primestar/shared';
import type { Env } from '../config/env';
import { addDays, addMinutes, randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * One-time links for invites and password resets. The token is shown once (in the email);
 * only its hash is stored, and issuing a new token replaces the old one, so an old link stops working.
 */
@Injectable()
export class LinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issueInvite(userId: string, db: Db = this.prisma): Promise<string> {
    const token = randomToken();
    await db.user.update({
      where: { id: userId },
      data: { inviteTokenHash: sha256(token), inviteExpiresAt: addDays(new Date(), INVITE_VALID_DAYS) },
    });
    return token;
  }

  async issueReset(userId: string, db: Db = this.prisma): Promise<string> {
    const token = randomToken();
    await db.user.update({
      where: { id: userId },
      data: { resetTokenHash: sha256(token), resetExpiresAt: addMinutes(new Date(), RESET_VALID_MINUTES) },
    });
    return token;
  }

  /**
   * Outside production the API also returns the link in its response, because emails are not sent from a
   * developer's machine. In production it is never returned: the only copy is the email.
   */
  devLink(param: 'invite' | 'reset', token: string): string | undefined {
    return this.config.get('NODE_ENV', { infer: true }) === 'production' ? undefined : this.link(param, token);
  }

  /** The frontend opens these as `/?invite=<token>` and `/?reset=<token>`. */
  private link(param: 'invite' | 'reset', token: string): string {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}/?${param}=${encodeURIComponent(token)}`;
  }

  /** Call after the database transaction has committed, never inside it. */
  queueInvite(user: { name: string; email: string }, token: string, invitedBy: string): Promise<boolean> {
    return this.queue.enqueueMail(
      {
        to: user.email,
        template: 'user-invite',
        params: { name: user.name, link: this.link('invite', token), expiresInDays: INVITE_VALID_DAYS, invitedBy },
      },
      { priority: 10 },
    );
  }

  queueReset(user: { id: string; name: string; email: string }, token: string): Promise<boolean> {
    return this.queue.enqueueMail(
      {
        to: user.email,
        template: 'password-reset',
        params: { name: user.name, link: this.link('reset', token), expiresInMinutes: RESET_VALID_MINUTES },
      },
      { priority: 10 },
    );
  }

  queueEmailChanged(user: { name: string }, oldEmail: string, newEmail: string): Promise<boolean> {
    return this.queue.enqueueMail(
      { to: oldEmail, template: 'email-changed', params: { name: user.name, newEmail } },
      { priority: 10 },
    );
  }
}
