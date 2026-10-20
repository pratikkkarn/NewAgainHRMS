import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { TokenLookup, useAccess } from '../../context/AccessContext';
import { Button } from '../common/UIComponents';
import { AuthShell } from './AuthShell';
import { PasswordChecklist, PasswordInput } from './PasswordFields';

interface SetPasswordPageProps {
  mode: 'invite' | 'reset';
  token: string;
  onDone: () => void; // back to the login page
}

// Opened from the invite email (?invite=…) or the reset email (?reset=…).
export const SetPasswordPage: React.FC<SetPasswordPageProps> = ({ mode, token, onDone }) => {
  const { findInvite, findReset, acceptInvite, completePasswordReset } = useAccess();
  // The demo store answers at once; the backend answers after a request, so the link is checked in an effect.
  const [lookup, setLookup] = useState<TokenLookup | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(mode === 'invite' ? findInvite(token) : findReset(token)).then((result) => {
      if (!cancelled) setLookup(result);
    });
    return () => {
      cancelled = true;
    };
    // The lookup functions change on every render; only the link itself matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthShell title="Password set">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          <span>
            {mode === 'invite'
              ? 'Your account is active. Sign in with your email and the password you just set.'
              : 'Your password was changed. Sign in with the new password.'}
          </span>
        </div>
        <Button variant="primary" className="w-full" onClick={onDone}>
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  if (!lookup) {
    return (
      <AuthShell title="Checking your link…">
        <p className="text-slate-500" role="status">One moment.</p>
      </AuthShell>
    );
  }

  if (!lookup.ok) {
    return (
      <AuthShell title={mode === 'invite' ? 'Invite link problem' : 'Reset link problem'}>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{lookup.error}</span>
        </div>
        <p className="text-slate-500">
          {mode === 'invite'
            ? 'Ask your HR team or admin to resend the invite.'
            : 'Use "Forgot password" on the sign-in page to get a new link.'}
        </p>
        <Button variant="outline" className="w-full" onClick={onDone}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  const user = lookup.user;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result =
      mode === 'invite'
        ? await acceptInvite(token, password, confirm)
        : await completePasswordReset(token, password, confirm);
    setSaving(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  };

  return (
    <AuthShell
      title={mode === 'invite' ? `Welcome, ${user.name.split(' ')[0]}` : 'Choose a new password'}
      subtitle={
        mode === 'invite'
          ? 'Set a password to activate your Prime Star HRMS account.'
          : `Resetting the password for ${user.email}.`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Your login</span>
          <span className="font-semibold text-slate-900">{user.email}</span>
        </div>
        <PasswordInput
          id="new-password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
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
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : mode === 'invite' ? 'Activate account' : 'Save new password'}
        </Button>
      </form>
    </AuthShell>
  );
};
