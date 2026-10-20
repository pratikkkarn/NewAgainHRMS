import { Injectable } from '@nestjs/common';
import type { Prisma } from '@primestar/db';
import type { AccessAuditAction } from '@primestar/shared';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  actorId?: string | null;
  actorIp?: string | null;
}

/**
 * Writes to the append-only AuditLog (the database refuses updates and deletes).
 * Pass the transaction client so the audit row commits or rolls back with the change it describes.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        actorId: entry.actorId ?? null,
        actorIp: entry.actorIp ?? null,
      },
    });
  }

  /** Access events (users, roles, passwords) are shown on the Users & Roles audit tab as target + details. */
  async access(
    db: Db,
    action: AccessAuditAction,
    actor: { id: string; ip?: string | undefined } | null,
    target: { type: 'User' | 'Role'; id: string; name: string },
    details: string,
  ): Promise<void> {
    await this.record(
      {
        entityType: target.type,
        entityId: target.id,
        action,
        after: { target: target.name, details },
        actorId: actor?.id ?? null,
        actorIp: actor?.ip ?? null,
      },
      db,
    );
  }
}
