import React, { ReactNode } from 'react';

// Centered card used by the password screens outside the main app.
export const AuthShell: React.FC<{ title: string; subtitle?: string; children: ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-4 font-sans antialiased">
    <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5 text-xs">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-lg">
          ★
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight block leading-tight text-slate-900">PRIME STAR</span>
          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest block">HRMS Portal</span>
        </div>
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);
