import React, { useState } from 'react';
import { ShieldCheck, Users, KeyRound, ScrollText, Lock } from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useAccess } from '../../../context/AccessContext';
import { cn } from '../../../lib/utils';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { AuditTab } from './AuditTab';

type TabId = 'users' | 'roles' | 'audit';

export const UsersRolesView: React.FC = () => {
  const { can } = useRole();
  const { mode } = useAccess();

  const tabs: { id: TabId; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, visible: can('user.manage') },
    { id: 'roles', label: 'Roles', icon: <KeyRound className="w-4 h-4" />, visible: can('role.manage') },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText className="w-4 h-4" />, visible: can('audit.view') },
  ];
  const visibleTabs = tabs.filter((t) => t.visible);
  const [activeTab, setActiveTab] = useState<TabId | null>(visibleTabs[0]?.id ?? null);
  const shownTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : visibleTabs[0]?.id;

  if (visibleTabs.length === 0) {
    return (
      <div className="bg-white p-10 rounded-xl border border-slate-200/80 text-center text-xs space-y-2">
        <Lock className="w-8 h-8 text-slate-300 mx-auto" />
        <h2 className="text-sm font-bold text-slate-900">No access</h2>
        <p className="text-slate-500">Your role does not include user, role or audit permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs">
      {/* PAGE HEADER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" /> Users & Roles
        </h1>
        <p className="text-slate-500 mt-0.5">
          Give people access, decide what each role can do, and see every access change.
        </p>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/80 w-fit">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer',
              shownTab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {shownTab === 'users' && <UsersTab />}
      {shownTab === 'roles' && <RolesTab />}
      {shownTab === 'audit' && <AuditTab />}

      <p className="text-[11px] text-slate-400">
        {mode === 'api'
          ? 'Changes are saved on the server. Invite emails are not sent yet; use the Link button on an invited user to copy their invite link.'
          : 'Demo mode: changes are saved in this browser only. No emails are sent until the backend is connected.'}
      </p>
    </div>
  );
};
