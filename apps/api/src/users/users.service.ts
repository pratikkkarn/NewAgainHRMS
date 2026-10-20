import { Injectable } from '@nestjs/common';
import { Prisma } from '@primestar/db';
import {
  checkCanDisable,
  checkCanEditUser,
  checkRoleAssignment,
  PROTECTED_ROLE_KEYS,
  type CreateUserBody,
  type RuleUser,
  type UpdateUserBody,
} from '@primestar/shared';
import { AppError } from '../common/app-error';
import type { AuthUser, RequestMeta } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { LinkService } from '../auth/link.service';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';

/** Any change that could remove the last CEO or HR Head takes this lock first, so two admins can't both do it. */
const PROTECTED_ROLES_LOCK = 7001;
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

type UserRow = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;
type Tx = Prisma.TransactionClient;

export interface UserListQuery {
  q?: string | undefined;
  status?: 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED' | undefined;
  roleId?: string | undefined;
  page: number;
  pageSize: number;
}

/** Hashes and tokens never leave the server. */
function toDto(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    employeeId: user.employeeId,
    roles: user.roles.map(({ role }) => ({ id: role.id, key: role.key, name: role.name })),
    lastLoginAt: user.lastLoginAt,
    lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil : null,
    inviteExpiresAt: user.status === 'INVITED' ? user.inviteExpiresAt : null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

const withRoles = { roles: { include: { role: true } } } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly links: LinkService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: UserListQuery) {
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.roleId ? { some: { roleId: query.roleId } } : undefined,
      OR: query.q
        ? [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: withRoles,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    return toDto(await this.find(id));
  }

  async create(actor: AuthUser, body: CreateUserBody, meta: RequestMeta) {
    const roles = await this.rolesByIds(body.roleIds);
    await this.assertEmailFree(body.email);
    if (body.employeeId) await this.assertEmployeeFree(body.employeeId);

    const { user, token } = await this.prisma.$transaction(async (tx) => {
      await this.lockProtectedRoles(tx);
      const refusal = checkRoleAssignment(this.actorRule(actor), null, roles.map((r) => r.key), await this.protectedHolders(tx));
      if (refusal) throw AppError.rule(refusal);

      const created = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          employeeId: body.employeeId,
          status: 'INVITED',
          createdById: actor.id,
          roles: { create: roles.map((role) => ({ roleId: role.id, assignedById: actor.id })) },
        },
        include: withRoles,
      });
      const inviteToken = await this.links.issueInvite(created.id, tx);
      await this.audit.access(
        tx,
        'User invited',
        { id: actor.id, ip: meta.ip },
        { type: 'User', id: created.id, name: created.name },
        `${created.email} invited as ${roles.map((r) => r.name).join(', ')}.`,
      );
      return { user: created, token: inviteToken };
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));

    // Queued only after the commit, so a rolled-back user never gets an email.
    const emailQueued = await this.links.queueInvite(user, token, actor.name);
    return { user: toDto(user), emailQueued, devInviteLink: this.links.devLink('invite', token) };
  }

  async update(actor: AuthUser, id: string, body: UpdateUserBody, meta: RequestMeta) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockProtectedRoles(tx);
      const target = await this.find(id, tx);
      const refusal = checkCanEditUser(this.actorRule(actor), this.toRule(target));
      if (refusal) throw AppError.rule(refusal);

      const ctx = { actor, target, meta, tx, emailChangedFrom: null as string | null, reinvite: false, rolesChanged: false };
      await this.applyDetails(ctx, body);
      await this.applyRoles(ctx, body);
      return { ...ctx, saved: await this.find(id, tx) };
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));

    if (outcome.rolesChanged) this.sessions.forgetUser(id);
    let emailQueued: boolean | undefined;
    let devInviteLink: string | undefined;
    if (outcome.reinvite) {
      const token = await this.links.issueInvite(id);
      emailQueued = await this.links.queueInvite(outcome.saved, token, actor.name);
      devInviteLink = this.links.devLink('invite', token);
    }
    if (outcome.emailChangedFrom && outcome.saved.status === 'ACTIVE') {
      await this.links.queueEmailChanged(outcome.saved, outcome.emailChangedFrom, outcome.saved.email);
    }
    return { user: toDto(outcome.saved), emailQueued, devInviteLink };
  }

  private async applyDetails(
    ctx: { actor: AuthUser; target: UserRow; meta: RequestMeta; tx: Tx; emailChangedFrom: string | null; reinvite: boolean },
    body: UpdateUserBody,
  ): Promise<void> {
    const { actor, target, meta, tx } = ctx;
    const nameChanged = body.name !== undefined && body.name !== target.name;
    const emailChanged = body.email !== undefined && body.email !== target.email;
    if (!nameChanged && !emailChanged) return;
    if (emailChanged) await this.assertEmailFree(body.email!, target.id, tx);

    await tx.user.update({
      where: { id: target.id },
      data: {
        name: body.name,
        email: body.email,
        // A pending password reset was sent to the old address, so it must not work any more.
        ...(emailChanged ? { resetTokenHash: null, resetExpiresAt: null } : {}),
      },
    });
    await this.audit.access(
      tx,
      'User updated',
      { id: actor.id, ip: meta.ip },
      { type: 'User', id: target.id, name: body.name ?? target.name },
      [nameChanged ? `Name: ${target.name} → ${body.name}` : null, emailChanged ? `Email: ${target.email} → ${body.email}` : null]
        .filter(Boolean)
        .join('; '),
    );
    if (emailChanged) ctx.emailChangedFrom = target.email;
    // The invite link went to the old details, so an invited user gets a fresh one.
    if (target.status === 'INVITED') ctx.reinvite = true;
  }

  private async applyRoles(
    ctx: { actor: AuthUser; target: UserRow; meta: RequestMeta; tx: Tx; rolesChanged: boolean },
    body: UpdateUserBody,
  ): Promise<void> {
    const { actor, target, meta, tx } = ctx;
    if (!body.roleIds) return;
    const before = new Set(target.roles.map(({ roleId }) => roleId));
    const after = new Set(body.roleIds);
    if (before.size === after.size && [...before].every((roleId) => after.has(roleId))) return;

    const roles = await this.rolesByIds(body.roleIds, tx);
    const refusal = checkRoleAssignment(this.actorRule(actor), this.toRule(target), roles.map((r) => r.key), await this.protectedHolders(tx));
    if (refusal) throw AppError.rule(refusal);

    await tx.userRole.deleteMany({ where: { userId: target.id } });
    await tx.userRole.createMany({ data: roles.map((role) => ({ userId: target.id, roleId: role.id, assignedById: actor.id })) });
    await this.sessions.revokeAll(target.id, undefined, tx);
    await this.audit.access(
      tx,
      'Roles changed',
      { id: actor.id, ip: meta.ip },
      { type: 'User', id: target.id, name: target.name },
      `${target.roles.map(({ role }) => role.name).join(', ')} → ${roles.map((r) => r.name).join(', ')}`,
    );
    ctx.rolesChanged = true;
  }

  async disable(actor: AuthUser, id: string, meta: RequestMeta) {
    const saved = await this.prisma.$transaction(async (tx) => {
      await this.lockProtectedRoles(tx);
      const target = await this.find(id, tx);
      if (target.status === 'DISABLED') return target;
      const refusal = checkCanDisable(this.actorRule(actor), this.toRule(target), await this.protectedHolders(tx));
      if (refusal) throw AppError.rule(refusal);

      await tx.user.update({ where: { id }, data: { status: 'DISABLED', inviteTokenHash: null, resetTokenHash: null } });
      await this.sessions.revokeAll(id, undefined, tx);
      await this.audit.access(tx, 'User disabled', { id: actor.id, ip: meta.ip }, { type: 'User', id, name: target.name }, 'Account disabled; all sessions ended.');
      return this.find(id, tx);
    }, TX_OPTIONS).catch((error: unknown) => this.translate(error));
    this.sessions.forgetUser(id);
    return toDto(saved);
  }

  async enable(actor: AuthUser, id: string, meta: RequestMeta) {
    const { saved, token } = await this.prisma.$transaction(async (tx) => {
      const target = await this.find(id, tx);
      const refusal = checkCanEditUser(this.actorRule(actor), this.toRule(target));
      if (refusal) throw AppError.rule(refusal);
      if (target.status !== 'DISABLED') throw AppError.conflict('Only a disabled account can be enabled.');

      // Someone who never set a password goes back to invited and gets a fresh link.
      const status = target.passwordHash ? 'ACTIVE' : 'INVITED';
      await tx.user.update({ where: { id }, data: { status, failedLoginCount: 0, lockedUntil: null } });
      const inviteToken = status === 'INVITED' ? await this.links.issueInvite(id, tx) : null;
      await this.audit.access(tx, 'User enabled', { id: actor.id, ip: meta.ip }, { type: 'User', id, name: target.name }, `Account enabled as ${status.toLowerCase()}.`);
      return { saved: await this.find(id, tx), token: inviteToken };
    }, TX_OPTIONS);
    const emailQueued = token ? await this.links.queueInvite(saved, token, actor.name) : undefined;
    return { user: toDto(saved), emailQueued, devInviteLink: token ? this.links.devLink('invite', token) : undefined };
  }

  async unlock(actor: AuthUser, id: string, meta: RequestMeta) {
    const saved = await this.prisma.$transaction(async (tx) => {
      const target = await this.find(id, tx);
      const refusal = checkCanEditUser(this.actorRule(actor), this.toRule(target));
      if (refusal) throw AppError.rule(refusal);
      await tx.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
      await this.audit.access(tx, 'Account unlocked', { id: actor.id, ip: meta.ip }, { type: 'User', id, name: target.name }, 'Login allowed again before the lock expired.');
      return this.find(id, tx);
    }, TX_OPTIONS);
    return toDto(saved);
  }

  async resendInvite(actor: AuthUser, id: string, meta: RequestMeta) {
    const { saved, token } = await this.prisma.$transaction(async (tx) => {
      const target = await this.find(id, tx);
      const refusal = checkCanEditUser(this.actorRule(actor), this.toRule(target));
      if (refusal) throw AppError.rule(refusal);
      if (target.status !== 'INVITED') throw AppError.conflict('Only users who have not accepted their invite can be sent a new one.');

      // The previous link stops working the moment a new one is issued.
      const inviteToken = await this.links.issueInvite(id, tx);
      await this.audit.access(tx, 'Invite resent', { id: actor.id, ip: meta.ip }, { type: 'User', id, name: target.name }, 'New invite link issued; the old link no longer works.');
      return { saved: target, token: inviteToken };
    }, TX_OPTIONS);
    const emailQueued = await this.links.queueInvite(saved, token, actor.name);
    return { user: toDto(saved), emailQueued, devInviteLink: this.links.devLink('invite', token) };
  }

  async requirePasswordChange(actor: AuthUser, id: string, meta: RequestMeta) {
    const saved = await this.prisma.$transaction(async (tx) => {
      const target = await this.find(id, tx);
      const refusal = checkCanEditUser(this.actorRule(actor), this.toRule(target));
      if (refusal) throw AppError.rule(refusal);
      if (target.status !== 'ACTIVE') throw AppError.conflict('Only active accounts can be asked to change their password.');

      await tx.user.update({ where: { id }, data: { mustChangePassword: true } });
      // Ends their sessions so it takes effect now, not at their next sign-in.
      await this.sessions.revokeAll(id, undefined, tx);
      await this.audit.access(tx, 'Password change required', { id: actor.id, ip: meta.ip }, { type: 'User', id, name: target.name }, 'Must set a new password at next login.');
      return this.find(id, tx);
    }, TX_OPTIONS);
    this.sessions.forgetUser(id);
    return toDto(saved);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async find(id: string, db: Tx | PrismaService = this.prisma): Promise<UserRow> {
    const user = await db.user.findUnique({ where: { id }, include: withRoles });
    if (!user) throw AppError.notFound('User');
    return user;
  }

  private async rolesByIds(ids: string[], db: Tx | PrismaService = this.prisma) {
    const unique = [...new Set(ids)];
    const roles = await db.role.findMany({ where: { id: { in: unique } } });
    if (roles.length !== unique.length) throw new AppError('VALIDATION_FAILED', 'One or more of the chosen roles do not exist.', 'roleIds');
    return roles;
  }

  private async assertEmailFree(email: string, exceptUserId?: string, db: Tx | PrismaService = this.prisma): Promise<void> {
    const taken = await db.user.findFirst({ where: { email, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true } });
    if (taken) throw AppError.conflict('A user with this email already exists.', 'email');
  }

  private async assertEmployeeFree(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { user: { select: { id: true } } } });
    if (!employee) throw new AppError('VALIDATION_FAILED', 'That employee does not exist.', 'employeeId');
    if (employee.user) throw AppError.conflict('That employee already has a login.', 'employeeId');
  }

  private async lockProtectedRoles(tx: Tx): Promise<void> {
    // Transaction-level, so it also works through Neon's pooled connection.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PROTECTED_ROLES_LOCK})`;
  }

  /** Everyone who holds the CEO or HR Head role, to check that someone is always left. */
  private async protectedHolders(tx: Tx): Promise<RuleUser[]> {
    const rows = await tx.user.findMany({
      where: { roles: { some: { role: { key: { in: [...PROTECTED_ROLE_KEYS] } } } } },
      include: withRoles,
    });
    return rows.map((row) => this.toRule(row));
  }

  private toRule(user: UserRow): RuleUser {
    return {
      id: user.id,
      status: user.status,
      roleKeys: user.roles.map(({ role }) => role.key),
      permissions: new Set(user.roles.flatMap(({ role }) => role.permissions)),
    };
  }

  private actorRule(actor: AuthUser): RuleUser {
    return { id: actor.id, status: 'ACTIVE', roleKeys: actor.roles.map((r) => r.key), permissions: actor.permissions };
  }

  /** A unique-index hit from a race (two requests creating the same email) reads as a normal conflict. */
  private translate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('A user with this email already exists.', 'email');
    }
    throw error;
  }
}
