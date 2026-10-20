import React, { useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { PASSWORD_RULES } from '../../lib/passwordDemo';
import { cn } from '../../lib/utils';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({ id, label, value, onChange, autoComplete, autoFocus }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="w-full px-3 py-2 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// Live checklist of the password rules; also shows whether the confirmation matches.
export const PasswordChecklist: React.FC<{ password: string; confirm: string }> = ({ password, confirm }) => (
  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
    {PASSWORD_RULES.map((r) => {
      const ok = r.test(password);
      return (
        <li key={r.id} className={cn('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
          {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
          {r.label}
        </li>
      );
    })}
    <li className={cn('flex items-center gap-1.5', confirm && confirm === password ? 'text-emerald-700' : 'text-slate-500')}>
      {confirm && confirm === password ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
      Both passwords match
    </li>
  </ul>
);
