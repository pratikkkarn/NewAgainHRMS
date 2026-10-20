import React, { useMemo, useState } from 'react';
import { BellRing, CheckCheck, ExternalLink } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { useRole } from '../../../context/RoleContext';
import { ALERT_TYPE_LABELS, AlertType } from '../../../lib/poAlerts';
import { formatDate, cn } from '../../../lib/utils';
import { Button } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';

interface NotificationsViewProps {
  onNavigate: (tab: string, params?: any) => void;
  initialTypeFilter?: 'all' | AlertType;
  initialUnreadOnly?: boolean;
  initialScope?: 'mine' | 'all';
  returnTo?: string;
}

const SEVERITY_STYLES = {
  critical: { dot: 'bg-red-500', label: 'Urgent', text: 'text-red-700 bg-red-50 border-red-200' },
  warning: { dot: 'bg-amber-500', label: 'Soon', text: 'text-amber-700 bg-amber-50 border-amber-200' },
  info: { dot: 'bg-blue-500', label: 'Heads-up', text: 'text-blue-700 bg-blue-50 border-blue-200' },
};

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onNavigate,
  initialTypeFilter,
  initialUnreadOnly,
  initialScope,
  returnTo,
}) => {
  const { myAlerts, allAlerts, isRead, markRead, markAllRead } = useSettings();
  const { can } = useRole();
  const canSeeAll = can('settings.manage');

  const [scope, setScope] = useState<'mine' | 'all'>(initialScope || 'mine');
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>(initialTypeFilter || 'all');
  const [unreadOnly, setUnreadOnly] = useState(initialUnreadOnly || false);

  React.useEffect(() => {
    if (initialTypeFilter) setTypeFilter(initialTypeFilter);
  }, [initialTypeFilter]);

  React.useEffect(() => {
    if (initialUnreadOnly !== undefined) setUnreadOnly(initialUnreadOnly);
  }, [initialUnreadOnly]);

  React.useEffect(() => {
    if (initialScope) setScope(initialScope);
  }, [initialScope]);

  const source = scope === 'all' && canSeeAll ? allAlerts : myAlerts;
  const shown = useMemo(
    () =>
      source.filter(
        (a) => (typeFilter === 'all' || a.type === typeFilter) && (!unreadOnly || !isRead(a.id))
      ),
    [source, typeFilter, unreadOnly, isRead]
  );
  const unread = shown.filter((a) => !isRead(a.id));

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-600" /> Notifications
          </h1>
          <p className="text-slate-500 mt-0.5">
            PO alerts for your role. Once the backend is live these are also emailed every morning at 9 AM.
          </p>
        </div>
        <Button
          variant="outline"
          icon={<CheckCheck className="w-4 h-4" />}
          disabled={unread.length === 0}
          onClick={() => markAllRead(unread.map((a) => a.id))}
        >
          Mark all read
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200/80">
        {canSeeAll && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  'px-3 py-1.5 rounded-md font-semibold cursor-pointer',
                  scope === s ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                )}
              >
                {s === 'mine' ? 'For my roles' : 'All alerts'}
              </button>
            ))}
          </div>
        )}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | AlertType)}
          className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
          aria-label="Filter by alert type"
        >
          <option value="all">All alert types</option>
          {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (
            <option key={t} value={t}>
              {ALERT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-indigo-600"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
        <span className="text-slate-500 ml-auto">
          {shown.length} alert(s), {unread.length} unread
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 divide-y divide-slate-100">
        {shown.map((a) => {
          const sev = SEVERITY_STYLES[a.severity];
          const read = isRead(a.id);
          return (
            <div key={a.id} className={cn('p-4 flex flex-col sm:flex-row gap-3', !read && 'bg-blue-50/30')}>
              <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0 hidden sm:block', sev.dot)} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('px-1.5 py-0.5 rounded border text-[10px] font-semibold', sev.text)}>{sev.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    {ALERT_TYPE_LABELS[a.type]}
                  </span>
                  {!read && <span className="text-[10px] font-bold text-blue-600">NEW</span>}
                </div>
                <div className="font-semibold text-slate-900 text-sm">{a.title}</div>
                <p className="text-slate-600">{a.message}</p>
                <p className="text-[11px] text-slate-400">
                  {a.projectName} · relates to {formatDate(a.date)}
                </p>
              </div>
              <div className="flex sm:flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  onClick={() => {
                    markRead(a.id);
                    onNavigate('pos', {
                      poId: a.poId,
                      returnTo: 'notifications',
                      typeFilter: typeFilter !== 'all' ? typeFilter : undefined,
                      unreadOnly: unreadOnly ? 'true' : undefined,
                      scope: scope !== 'mine' ? scope : undefined,
                    });
                  }}
                >
                  Open PO
                </Button>
                {!read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <EmptyState
            title="No alerts"
            message={
              unreadOnly || typeFilter !== 'all'
                ? 'Nothing matches these filters.'
                : 'No PO is near expiry, running low or due for a milestone for your roles.'
            }
          />
        )}
      </div>
    </div>
  );
};
