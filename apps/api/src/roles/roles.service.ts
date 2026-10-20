import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@primestar/db';
import {
  checkCanDeleteRole,
  checkCanEditRole,
  findUnknownPermissions,
  isCeo,
  type CreateRoleBody,
  type RuleRole,
  type RuleUser,
  type UpdateRoleBody,
} from '@primestar/shared';
import { AppError } from '../common/app-error';
import type { AuthUser, RequestMeta } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { AuthUserService } from '../auth/auth-user.service';
import { PrismaService } from '../prisma/prisma.service';

const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

type RoleRow = Prisma.RoleGetPayload<{ include: { _count: { select: { users: true } } } }>;

const toDto = (role: RoleRow) => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  permissions: role.permissions,
  isSystem: role.isSystem,
  isLocked: role.isLocked,
  userCount: role._count.users,
});

const withCount = { _count: { select: { users: true } } } as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authUsers: AuthUserService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({ include: withCount, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return roles.map(toDto);
  }

  async create(actor: AuthUser, body: CreateRoleBody, meta: RequestMeta) {
    const permissions = this.cleanPermissions(body.permissions);
    this.assertCanGrant(actor, permissions);
    await this.assertNameFree(body.name);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          // Custom roles get a generated key, so a rename never breaks anything that refers to it.
          key: `CUSTOM_${randomBytes(4).toString('hex').toUpperCase()}`,
          name: body.name,
          description: body.description,
          permissions,
          isSystem: false,
          createdById: actor.id,
        },
        include: withCount,
      });
      await this.audit.access(tx, 'Role created', { id: actor.id, ip: meta.ip }, { type: 'Role', id: created.id, name: created.name }, `${permissions.length} permission(s).`);
      return created;
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));
    return toDto(role);
  }

  async update(actor: AuthUser, id: string, body: UpdateRoleBody, meta: RequestMeta) {
    const role = await this.find(id);
    const refusal = checkCanEditRole(this.actorRule(actor), this.toRule(role));
    if (refusal) throw AppError.rule(refusal);

    if (body.name !== undefined && body.name !== role.name) await this.assertNameFree(body.name, id);
    const permissions = body.permissions ? this.cleanPermissions(body.permissions) : undefined;
    const added = permissions ? permissions.filter((p) => !role.permissions.includes(p)) : [];
    const removed = permissions ? role.permissions.filter((p) => !permissions.includes(p)) : [];
    // Only permissions being added count, so an admin can still trim a role that holds more than they do.
    this.assertCanGrant(actor, added);

    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: { name: body.name, description: body.description, permissions },
        include: withCount,
      });
      const changes = [
        body.name !== undefined && body.name !== role.name ? `Renamed from ${role.name}` : null,
        added.length ? `Added: ${added.join(', ')}` : null,
        removed.length ? `Removed: ${removed.join(', ')}` : null,
      ].filter(Boolean);
      await this.audit.access(
        tx,
        'Role updated',
        { id: actor.id, ip: meta.ip },
        { type: 'Role', id, name: updated.name },
        changes.join('. ') || 'Description updated.',
      );
      return updated;
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));

    // Everyone holding this role may now have different permissions.
    this.authUsers.invalidateAll();
    return toDto(saved);
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: withCount });
      if (!role) throw AppError.notFound('Role');
      const refusal = checkCanDeleteRole(this.actorRule(actor), this.toRule(role), role._count.users);
      if (refusal) throw AppError.rule(refusal);

      await tx.role.delete({ where: { id } });
      await this.audit.access(tx, 'Role deleted', { id: actor.id, ip: meta.ip }, { type: 'Role', id, name: role.name }, 'Custom role removed.');
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async find(id: string): Promise<RoleRow> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: withCount });
    if (!role) throw AppError.notFound('Role');
    return role;
  }

  private cleanPermissions(permissions: string[]): string[] {
    const unknown = findUnknownPermissions(permissions);
    if (unknown.length > 0) {
      throw new AppError('VALIDATION_FAILED', `Unknown permission(s): ${unknown.join(', ')}.`, 'permissions');
    }
    return [...new Set(permissions)].sort();
  }

  /**
   * Stops privilege escalation: someone who can manage roles can't hand out access they don't have
   * themselves (for example by making a role with salary access and giving it to a friend).
   * A CEO holds everything, so the rule never limits them.
   */
  private assertCanGrant(actor: AuthUser, permissions: string[]): void {
    if (isCeo({ roleKeys: actor.roles.map((r) => r.key) })) return;
    const missing = permissions.filter((permission) => !actor.permissions.has(permission));
    if (missing.length > 0) {
      throw AppError.rule(`You cannot give a role permissions you do not have yourself: ${missing.join(', ')}.`);
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (taken) throw AppError.conflict('A role with this name already exists.', 'name');
  }

  private toRule(role: Pick<RoleRow, 'id' | 'key' | 'name' | 'isSystem' | 'isLocked'>): RuleRole {
    return { id: role.id, key: role.key, name: role.name, isSystem: role.isSystem, isLocked: role.isLocked };
  }

  private actorRule(actor: AuthUser): RuleUser {
    return { id: actor.id, status: 'ACTIVE', roleKeys: actor.roles.map((r) => r.key), permissions: actor.permissions };
  }

  private translate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw AppError.conflict('A role with this name already exists.', 'name');
      // A user was given the role between the "in use" check and the delete.
      if (error.code === 'P2003') throw AppError.conflict('This role is still in use. Reassign its users first.');
    }
    throw error;
  }
}
