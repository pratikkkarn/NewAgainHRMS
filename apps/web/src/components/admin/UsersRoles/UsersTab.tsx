import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Send, Ban, CheckCircle2, Link2, KeyRound, Unlock, Copy } from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useAccess } from '../../../context/AccessContext';
import { useNotification } from '../../../context/NotificationContext';
import { AppUser, AppUserStatus } from '../../../types/access';
import { checkCanEditUser } from '../../../lib/accessRules';
import { isLocked, linkWithParam, minutesUntil } from '../../../lib/passwordDemo';
import { Button, Badge, Modal } from '../../common/UIComponents';
import { UserFormModal } from './UserFormModal';

const STATUS_STYLES: Record<AppUserStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Invited: 'bg-amber-50 text-amber-700 border-amber-200',
  Disabled: 'bg-red-50 text-red-700 border-red-200',
};

export const UsersTab: React.FC = () => {
  const { currentAppUser } = useRole();
  const { users, roles, setUserStatus, resendInvite, requirePasswordChange, unlockUser } = useAccess();
  const { showToast } = useNotification();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AppUserStatus>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [confirmUser, setConfirmUser] = useState<AppUser | null>(null);
  const [linkUser, setLinkUser] = useState<AppUser | null>(null);
  const [copied, setCopied] = useState(false);
  // Which action is waiting on the server, as `<user id>:<action>`. Its button shows a spinner and the row is locked.
  const [busy, setBusy] = useState<string | null>(null);
  const rowBusy = (u: AppUser) => busy !== null && busy.startsWith(`${u.id}:`);
  const isBusy = (u: AppUser, action: string) => busy === `${u.id}:${action}`;

  const runAction = async (
    key: string,
    start: () => { ok: true } | { ok: false; error: string } | Promise<{ ok: true } | { ok: false; error: string }>,
    title: string,
    message: string
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      const result = await start();
      if (result.ok) showToast(title, message);
      else showToast('Not allowed', result.error, 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed', 'Select the link and copy it manually.', 'warning');
    }
  };

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || 'Unknown role';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (roleFilter === 'all' || u.roleIds.includes(roleFilter)) &&
        (statusFilter === 'all' || u.status === statusFilter)
    );
  }, [users, search, roleFilter, statusFilter]);

  const openAdd = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openEdit = (u: AppUser) => {
    const error = checkCanEditUser(currentAppUser, u, roles);
    if (error) {
      showToast('Not allowed', error, 'error');
      return;
    }
    setEditingUser(u);
    setFormOpen(true);
  };

  const handleResend = (u: AppUser) =>
    runAction(`${u.id}:resend`, () => resendInvite(currentAppUser, u.id), 'Invite resent', `A new invite link was issued to ${u.email}.`);

  const handleStatusChange = async (u: AppUser) => {
    const next: AppUserStatus = u.status === 'Disabled' ? 'Active' : 'Disabled';
    // The confirmation stays open, with its button spinning, until the server answers.
    await runAction(
      `${u.id}:status`,
      () => setUserStatus(currentAppUser, u.id, next),
      next === 'Disabled' ? 'User disabled' : 'User enabled',
      `${u.name} is now ${next.toLowerCase()}.`
    );
    setConfirmUser(null);
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="space-y-4">
      {/* TOOLBAR */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
          aria-label="Filter by role"
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | AppUserStatus)}
          className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Invited">Invited</option>
          <option value="Disabled">Disabled</option>
        </select>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
          Add User
        </Button>
      </div>

      {/* USERS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((u) => {
              const isSelf = u.id === currentAppUser.id;
              const editBlocked = checkCanEditUser(currentAppUser, u, roles);
              return (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">
                      {u.name} {isSelf && <span className="text-[10px] text-indigo-600 font-bold ml-1">(you)</span>}
                    </div>
                    {u.employeeId && <div className="text-[10px] text-slate-400 font-mono">{u.employeeId}</div>}
                  </td>
                  <td className="p-3 text-slate-600">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roleIds.map((rid) => (
                        <Badge key={rid} status="neutral">
                          {roleName(rid)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge status={u.status} className={STATUS_STYLES[u.status]} />
                    {u.status === 'Invited' && (
                      <div className="text-[10px] text-slate-400 mt-0.5">Sent {fmt(u.invitedAt)}</div>
                    )}
                    {isLocked(u.lockedUntil) && (
                      <div className="text-[10px] text-red-600 font-semibold mt-0.5">
                        Locked · {minutesUntil(u.lockedUntil!)} min left
                      </div>
                    )}
                    {u.mustChangePassword && (
                      <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Must change password</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <span title={editBlocked || 'Edit roles and details'}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => openEdit(u)}
                          disabled={!!editBlocked || rowBusy(u)}
                        >
                          Edit
                        </Button>
                      </span>
                      {u.status === 'Invited' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Link2 className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setCopied(false);
                              setLinkUser(u);
                            }}
                            title="Show the invite link (demo: stands in for the email)"
                          >
                            Link
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Send className="w-3.5 h-3.5" />}
                            onClick={() => handleResend(u)}
                            loading={isBusy(u, 'resend')}
                            disabled={rowBusy(u)}
                            title="Send a new invite link"
                          >
                            Resend
                          </Button>
                        </>
                      )}
                      {isLocked(u.lockedUntil) && !editBlocked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Unlock className="w-3.5 h-3.5" />}
                          onClick={() =>
                            runAction(`${u.id}:unlock`, () => unlockUser(currentAppUser, u.id), 'Account unlocked', `${u.name} can sign in again.`)
                          }
                          loading={isBusy(u, 'unlock')}
                          disabled={rowBusy(u)}
                        >
                          Unlock
                        </Button>
                      )}
                      {u.status === 'Active' && !u.mustChangePassword && !editBlocked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<KeyRound className="w-3.5 h-3.5" />}
                          onClick={() =>
                            runAction(
                              `${u.id}:password`,
                              () => requirePasswordChange(currentAppUser, u.id),
                              'Password change required',
                              `${u.name} must set a new password at next sign-in.`
                            )
                          }
                          loading={isBusy(u, 'password')}
                          disabled={rowBusy(u)}
                          title="Make them choose a new password at next sign-in"
                        >
                          Reset pwd
                        </Button>
                      )}
                      <span title={editBlocked || (u.status === 'Disabled' ? 'Allow login again' : 'Block login')}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={
                            u.status === 'Disabled' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )
                          }
                          onClick={() => setConfirmUser(u)}
                          disabled={!!editBlocked || rowBusy(u)}
                          className={u.status === 'Disabled' ? 'text-emerald-700' : 'text-red-600'}
                        >
                          {u.status === 'Disabled' ? 'Enable' : 'Disable'}
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  No users match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <UserFormModal user={editingUser} onClose={() => setFormOpen(false)} />
      )}

      {/* INVITE LINK (demo stand-in for the invite email) */}
      {linkUser && (
        <Modal isOpen onClose={() => setLinkUser(null)} title={`Invite link for ${linkUser.name}`} maxWidth="lg">
          <div className="space-y-4 text-xs">
            {(() => {
              const current = users.find((x) => x.id === linkUser.id);
              if (!current?.inviteToken) {
                return <p className="text-slate-600">This invite has no active link. Use Resend to issue a new one.</p>;
              }
              const link = linkWithParam('invite', current.inviteToken);
              return (
                <>
                  <p className="text-slate-600">
                    In the live system this link is emailed to <strong>{current.email}</strong>. It works once and
                    expires on {fmt(current.inviteExpiresAt)}. For testing, open it in a private window.
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] break-all text-blue-700">
                    {link}
                  </div>
                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <Button variant="outline" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => copyLink(link)}>
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button variant="primary" onClick={() => window.open(link, '_blank', 'noopener')}>
                      Open link
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* DISABLE / ENABLE CONFIRMATION */}
      {confirmUser && (
        <Modal
          isOpen
          onClose={() => setConfirmUser(null)}
          title={confirmUser.status === 'Disabled' ? 'Enable user?' : 'Disable user?'}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-700">
              {confirmUser.status === 'Disabled' ? (
                <>
                  <strong>{confirmUser.name}</strong> will be able to log in again with their existing roles.
                </>
              ) : (
                <>
                  <strong>{confirmUser.name}</strong> will be logged out and blocked from logging in. Their history
                  is kept.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setConfirmUser(null)} disabled={isBusy(confirmUser, 'status')}>
                Cancel
              </Button>
              <Button
                variant={confirmUser.status === 'Disabled' ? 'success' : 'danger'}
                onClick={() => void handleStatusChange(confirmUser)}
                loading={isBusy(confirmUser, 'status')}
              >
                {isBusy(confirmUser, 'status')
                  ? confirmUser.status === 'Disabled'
                    ? 'Enabling…'
                    : 'Disabling…'
                  : confirmUser.status === 'Disabled'
                    ? 'Enable User'
                    : 'Disable User'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
