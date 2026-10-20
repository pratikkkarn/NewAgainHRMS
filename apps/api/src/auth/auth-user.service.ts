import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators';

const CACHE_SECONDS = 60;

interface CacheEntry {
  expires: number;
  userId: string;
  user: AuthUser;
}

/**
 * Loads the signed-in user (roles, permissions, session still valid) for the guard.
 * Results are cached for 60 seconds, and cleared immediately when a user is disabled,
 * their roles change or they sign out. With one API instance that makes changes instant;
 * with several, the worst case is the 60 second cache.
 */
@Injectable()
export class AuthUserService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async load(userId: string, sessionId: string): Promise<AuthUser | null> {
    const cached = this.cache.get(sessionId);
    if (cached && cached.expires > Date.now() && cached.userId === userId) return cached.user;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.userId !== userId || session.revokedAt || session.expiresAt < new Date()) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return null;

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      roles: user.roles.map(({ role }) => ({ id: role.id, key: role.key, name: role.name })),
      permissions: new Set(user.roles.flatMap(({ role }) => role.permissions)),
      mustChangePassword: user.mustChangePassword,
      sessionId,
    };
    this.cache.set(sessionId, { expires: Date.now() + CACHE_SECONDS * 1000, userId, user: authUser });
    return authUser;
  }

  invalidateUser(userId: string): void {
    for (const [sessionId, entry] of this.cache) if (entry.userId === userId) this.cache.delete(sessionId);
  }

  invalidateSession(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /** A role's permission list changed, so every cached user may be out of date. */
  invalidateAll(): void {
    this.cache.clear();
  }
}
