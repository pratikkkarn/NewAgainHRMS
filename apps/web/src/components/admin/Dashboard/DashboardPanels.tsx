import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { useAccess } from '../../../context/AccessContext';
import { useRole } from '../../../context/RoleContext';
import { isLocked } from '../../../lib/passwordDemo';
import { cn } from '../../../lib/utils';
import { Card } from '../../common/UIComponents';

interface Props {
  onNavigate: (tab: string, params?: any) => void;
}

const DOT = { critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' };

// Role-aware panels on top of the dashboard: what needs attention for this user's roles,
// and an access summary for people who manage users.
export const DashboardPanels: React.FC<Props> = ({ onNavigate }) => {
  const { can } = useRole();
  const { myAlerts, isRead } = useSettings();
  const { users } = useAccess();

  const showAlerts = can('po.view');
  const showAccess = can('user.manage');
  if (!showAlerts && !showAccess) return null;

  const unread = myAlerts.filter((a) => !isRead(a.id));
  const counts = {
    active: users.filter((u) => u.status === 'Active').length,
    invited: users.filter((u) => u.status === 'Invited').length,
    disabled: users.filter((u) => u.status === 'Disabled').length,
    locked: users.filter((u) => isLocked(u.lockedUntil)).length,
  };

  return (
    <div className={cn('grid gap-4 items-start', showAlerts && showAccess ? 'lg:grid-cols-3' : 'grid-cols-1')}>
      {showAlerts && (
        <Card className={cn('space-y-3', showAccess && 'lg:col-span-2')}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs your attention
              {unread.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px]">
                  {unread.length} new
                </span>
              )}
            </h2>
            <button
              onClick={() => onNavigate('notifications')}
              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              All alerts <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {myAlerts.length === 0 ? (
            <p className="flex items-center gap-2 text-emerald-700 py-2">
              <CheckCircle2 className="w-4 h-4" /> Nothing urgent for your roles. All POs are in good shape.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myAlerts.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => onNavigate('po-tracker', { poId: a.poId })}
                    className="w-full text-left py-2 flex items-start gap-2 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', DOT[a.severity])} />
                    <span className="flex-1 min-w-0">
                      <span className={cn('block text-slate-900', !isRead(a.id) && 'font-semibold')}>{a.title}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{a.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {showAccess && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> User access
            </h2>
            <button
              onClick={() => onNavigate('users-roles')}
              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Users & Roles <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-4 divide-x divide-slate-100 rounded-lg border border-slate-200/70">
            {[
              { label: 'Active', value: counts.active, tone: 'text-slate-900' },
              { label: 'Invited', value: counts.invited, tone: counts.invited ? 'text-amber-700' : 'text-slate-900' },
              { label: 'Disabled', value: counts.disabled, tone: 'text-slate-900' },
              { label: 'Locked', value: counts.locked, tone: counts.locked ? 'text-red-700' : 'text-slate-900' },
            ].map((c) => (
              <div key={c.label} className="px-3 py-2.5">
                <span className="text-[11px] font-medium text-slate-500 block">{c.label}</span>
                <span className={cn('figure text-xl font-semibold', c.tone)}>{c.value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
