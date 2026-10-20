import { Controller, Get, Query } from '@nestjs/common';
import type { Prisma } from '@primestar/db';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RequirePermission } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

const AuditQuery = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.uuid().optional(),
  action: z.string().max(60).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
class AuditQueryDto extends createZodDto(AuditQuery) {}

@Controller('audit')
@RequirePermission('audit.view')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
      actorId: query.actorId,
      createdAt: {
        // India-time day boundaries.
        gte: query.from ? new Date(`${query.from}T00:00:00+05:30`) : undefined,
        lt: query.to ? new Date(new Date(`${query.to}T00:00:00+05:30`).getTime() + 86_400_000) : undefined,
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

    const items = rows.map((row) => {
      const after = (row.after ?? {}) as { target?: string; details?: string };
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        actorName: row.actorId ? (actorName.get(row.actorId) ?? 'Unknown user') : 'System',
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        target: after.target ?? null,
        details: after.details ?? row.reason ?? null,
        before: row.before,
        after: row.after,
      };
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
