import React, { useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useAccess } from '../../../context/AccessContext';
import { useNotification } from '../../../context/NotificationContext';
import { AppUser, CEO_ROLE_ID } from '../../../types/access';
import { isCeo } from '../../../lib/accessRules';
import { Button, Input, Modal } from '../../common/UIComponents';
import { cn } from '../../../lib/utils';

interface UserFormModalProps {
  user: AppUser | null; // null = add a new user
  onClose: () => void;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({ user, onClose }) => {
  const { currentAppUser } = useRole();
  const { roles, inviteUser, updateUser } = useAccess();
  const { showToast } = useNotification();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const actorIsCeo = isCeo(currentAppUser);

  const toggleRole = (id: string) => {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const input = { name, email, roleIds };
    setSaving(true);
    setError(null);
    // The server answers after a request; the demo store answers at once. Awaiting works for both.
    const result = await (user ? updateUser(currentAppUser, user.id, input) : inviteUser(currentAppUser, input));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(
      user ? 'User updated' : 'Invite sent',
      user ? `${name.trim()}'s access was updated.` : `${email.trim()} will get a link to set their password.`
    );
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Add User'}
      subtitle={user ? 'Change their details or roles.' : 'They get an email link to set their own password.'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          helperText="Their login ID. Use their work email."
        />

        <div>
          <span className="block text-xs font-medium text-slate-700 mb-1">
            Roles <span className="text-red-500">*</span>
          </span>
          <p className="text-[11px] text-slate-500 mb-2">A person can hold more than one role; their access combines.</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {roles.map((r) => {
              const ceoBlocked = r.id === CEO_ROLE_ID && !actorIsCeo;
              const checked = roleIds.includes(r.id);
              return (
                <label
                  key={r.id}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors',
                    checked ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200',
                    ceoBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                  )}
                  title={ceoBlocked ? 'Only a CEO can assign the CEO role.' : undefined}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-indigo-600"
                    checked={checked}
                    disabled={ceoBlocked}
                    onChange={() => toggleRole(r.id)}
                  />
                  <span>
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      {r.name}
                      {r.locked && <Lock className="w-3 h-3 text-slate-400" />}
                      {!r.builtIn && <span className="text-[10px] text-indigo-600 font-bold">CUSTOM</span>}
                    </span>
                    <span className="text-[11px] text-slate-500">{r.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : user ? 'Save Changes' : 'Send Invite'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
