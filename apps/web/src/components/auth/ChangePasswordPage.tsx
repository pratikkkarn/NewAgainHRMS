import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAccess } from '../../context/AccessContext';
import { useRole } from '../../context/RoleContext';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../common/UIComponents';
import { AuthShell } from './AuthShell';
import { PasswordChecklist, PasswordInput } from './PasswordFields';

interface ChangePasswordPageProps {
  forced: boolean; // true when an admin required a new password before entering the app
  onDone: () => void;
  onCancel: () => void; // sign out when forced, go back otherwise
}

export const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ forced, onDone, onCancel }) => {
  const { changePassword } = useAccess();
  const { currentAppUser } = useRole();
  const { showToast } = useNotification();

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsCurrent = !!currentAppUser.passwordHash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await changePassword(currentAppUser.id, current, password, confirm);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast('Password changed', 'Use the new password next time you sign in.');
    onDone();
  };

  return (
    <AuthShell
      title={forced ? 'Set a new password to continue' : 'Change password'}
      subtitle={
        forced
          ? 'Your admin asked you to choose a new password before using the system.'
          : `Signed in as ${currentAppUser.email}.`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {needsCurrent && (
          <PasswordInput
            id="current-password"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
        )}
        <PasswordInput
          id="new-password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus={!needsCurrent}
        />
        <PasswordInput
          id="confirm-password"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <PasswordChecklist password={password} confirm={confirm} />
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {forced ? 'Sign out' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Save password'}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
};
