import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useData } from '../../../context/DataContext';
import { Badge, Button, Card } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';
import { CHART, ChartCard, ChartTooltipBox, LegendItem, Meter } from '../../common/ChartKit';
import { formatDate, formatINR, formatINRCompact, getDaysRemaining, cn } from '../../../lib/utils';
import { netInvoicedByMonth, monthKey } from '../../../lib/poForecast';
import { POStatus } from '../../../types/domain';
import { DashboardPanels } from './DashboardPanels';

interface AdminDashboardViewProps {
  onNavigate: (tab: string, params?: any) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Status meaning is shown with an icon + label, never colour alone.
const STATUS_META: { status: POStatus; label: string; icon: React.ElementType; tone: string; bar: string }[] = [
  { status: 'Active', label: 'Active', icon: CheckCircle2, tone: 'text-emerald-600', bar: 'bg-emerald-500' },
  { status: 'Expiring Soon', label: 'Expiring soon', icon: Clock, tone: 'text-amber-600', bar: 'bg-amber-500' },
  { status: 'Low Balance', label: 'Low balance', icon: AlertTriangle, tone: 'text-orange-600', bar: 'bg-orange-500' },
  { status: 'Fully Utilized', label: 'Fully used', icon: CircleSlash, tone: 'text-red-600', bar: 'bg-red-500' },
  { status: 'Expired', label: 'Expired', icon: CalendarClock, tone: 'text-red-600', bar: 'bg-red-500' },
  { status: 'Renewed', label: 'Renewed', icon: RefreshCw, tone: 'text-slate-500', bar: 'bg-slate-400' },
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onNavigate }) => {
  const { currentUser, can } = useRole();
  const { purchaseOrders, projects } = useData();
  const showPO = can('po.view');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const firstName = currentUser.name?.split(' ')[0] || 'there';

  // ─── KPIs (Renewed and Closed POs no longer carry live balance) ───
  const live = purchaseOrders.filter((p) => p.status !== 'Renewed' && p.status !== 'Closed');
  const totalValue = live.reduce((s, p) => s + (p.amountExclGst || 0), 0);
  const invoiced = live.reduce((s, p) => s + (p.invoicedExclGst || 0) - (p.creditNotesExclGst || 0), 0);
  const remaining = live.reduce((s, p) => s + (p.remainingBalanceExclGst || 0), 0);
  const utilisation = totalValue > 0 ? invoiced / totalValue : 0;
  const activeCount = purchaseOrders.filter((p) => p.status === 'Active').length;
  const attentionCount = purchaseOrders.filter((p) =>
    ['Expiring Soon', 'Low Balance', 'Expired', 'Fully Utilized'].includes(p.status)
  ).length;

  // ─── Billing by project: invoiced + remaining = PO value (part-to-whole) ───
  const byProject = useMemo(
    () =>
      projects
        .map((proj) => {
          const pos = live.filter((p) => p.projectId === proj.id);
          const value = pos.reduce((s, p) => s + p.amountExclGst, 0);
          const rem = pos.reduce((s, p) => s + p.remainingBalanceExclGst, 0);
          return { id: proj.id, name: proj.name, client: proj.clientName, value, invoiced: Math.max(0, value - rem), remaining: rem, count: pos.length };
        })
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, purchaseOrders]
  );

  // ─── Monthly invoicing, last 12 months (net of credit notes, cancelled ignored) ───
  const monthly = useMemo(() => {
    const totals = new Map<string, number>();
    purchaseOrders.forEach((po) =>
      netInvoicedByMonth(po).forEach((amt, key) => totals.set(key, (totals.get(key) || 0) + amt))
    );
    const now = new Date();
    const build = (end: Date) =>
      Array.from({ length: 12 }, (_, i) => {
        const d = new Date(end.getFullYear(), end.getMonth() - 11 + i, 1);
        const key = monthKey(d);
        return { key, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, amount: Math.max(0, totals.get(key) || 0) };
      });
    const recent = build(now);
    const invoicedKeys = [...totals.entries()].filter(([, v]) => v > 0).map(([k]) => k).sort();
    if (recent.some((m) => m.amount > 0) || invoicedKeys.length === 0) return { months: recent, isRecent: true, invoicedKeys };
    const [y, m] = invoicedKeys[invoicedKeys.length - 1].split('-').map(Number);
    return { months: build(new Date(y, m - 1, 1)), isRecent: false, invoicedKeys };
  }, [purchaseOrders]);
  const hasMonthly = monthly.months.some((m) => m.amount > 0);
  // Average over the last 3 months that actually had invoices (matches the run-out forecast rule).
  const recentInvoiced = useMemo(() => {
    const totals = new Map<string, number>();
    purchaseOrders.forEach((po) =>
      netInvoicedByMonth(po).forEach((amt, key) => totals.set(key, (totals.get(key) || 0) + amt))
    );
    const vals = monthly.invoicedKeys.slice(-3).map((k) => totals.get(k) || 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [purchaseOrders, monthly]);

  // ─── Portfolio health ───
  const statusRows = STATUS_META.map((m) => {
    const pos = purchaseOrders.filter((p) => p.status === m.status);
    return { ...m, count: pos.length, value: pos.reduce((s, p) => s + p.amountExclGst, 0) };
  });
  const maxStatus = Math.max(1, ...statusRows.map((r) => r.count));

  // ─── Expiring in the next 90 days ───
  const expiring = live
    .map((p) => ({ po: p, days: getDaysRemaining(p.expiryDate) }))
    .filter((x) => x.days >= 0 && x.days <= 90)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  // ─── Recent POs ───
  const recent = [...purchaseOrders].sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).slice(0, 6);

  const openPO = (poId: string) => onNavigate('po-tracker', { poId });

  return (
    <div className="space-y-6 text-xs max-w-[1600px] mx-auto">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{todayLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-0.5">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {showPO ? 'Purchase orders, billing and renewals at a glance.' : 'Welcome to Prime Star HRMS.'}
          </p>
        </div>
        {showPO && (
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<FileText className="w-4 h-4" />} onClick={() => onNavigate('po-tracker')}>
              All purchase orders
            </Button>
            {can('po.create') && (
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => onNavigate('po-tracker')}>
                New PO
              </Button>
            )}
          </div>
        )}
      </div>

      {/* KPI ROW */}
      {showPO && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="p-5" onClick={() => onNavigate('po-tracker')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Live PO value</span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="figure text-[28px] leading-9 font-semibold text-slate-900 mt-2">{formatINRCompact(totalValue)}</div>
            <p className="text-xs text-slate-500 mt-1">
              {live.length} open PO{live.length === 1 ? '' : 's'} · {formatINR(totalValue)} excl. GST
            </p>
          </Card>

          <Card className="p-5" onClick={() => onNavigate('invoices')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Invoiced to date</span>
              <span className="text-xs font-semibold text-slate-700 tabular-nums">{Math.round(utilisation * 100)}% used</span>
            </div>
            <div className="figure text-[28px] leading-9 font-semibold text-slate-900 mt-2">{formatINRCompact(invoiced)}</div>
            <Meter value={utilisation} className="mt-3" label="Share of live PO value invoiced" />
          </Card>

          <Card className="p-5" onClick={() => onNavigate('po-tracker')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Remaining balance</span>
              <span className="text-[11px] text-slate-400">available to bill</span>
            </div>
            <div className="figure text-[28px] leading-9 font-semibold text-slate-900 mt-2">{formatINRCompact(remaining)}</div>
            <p className="text-xs text-slate-500 mt-1">
              {recentInvoiced > 0
                ? `~${formatINRCompact(recentInvoiced)} billed per month recently`
                : 'No invoices yet'}
            </p>
          </Card>

          <Card className="p-5" onClick={() => onNavigate('po-tracker', { statusFilter: 'Expiring Soon' })}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">POs needing action</span>
              <AlertTriangle className={cn('w-4 h-4', attentionCount > 0 ? 'text-amber-500' : 'text-slate-300')} />
            </div>
            <div className="figure text-[28px] leading-9 font-semibold text-slate-900 mt-2">
              {attentionCount}
              <span className="text-sm font-medium text-slate-400"> / {purchaseOrders.length}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeCount} active · expiring, low, expired or fully used
            </p>
          </Card>
        </div>
      )}

      <DashboardPanels onNavigate={onNavigate} />

      {!showPO && (
        <Card className="p-0">
          <EmptyState
            title="No PO data for your role"
            message="Purchase order information is shown to roles with PO access. Ask your admin if you need it."
          />
        </Card>
      )}

      {showPO && (
        <>
          {/* BILLING BY PROJECT + PORTFOLIO HEALTH */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard
              className="xl:col-span-2"
              title="Billing by project"
              subtitle="How much of each project's live PO value is invoiced, and what is left to bill"
              legend={
                <>
                  <LegendItem color={CHART.series1} label="Invoiced" />
                  <LegendItem color={CHART.series1Light} label="Remaining" />
                </>
              }
              chart={
                byProject.length === 0 ? (
                  <EmptyState title="No live POs yet" message="Projects appear here once they have an open PO." />
                ) : (
                  <div style={{ height: Math.max(240, byProject.length * 64 + 48) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byProject} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={12}>
                        <CartesianGrid horizontal={false} stroke={CHART.grid} />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => formatINRCompact(v)}
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={200}
                          axisLine={false}
                          tickLine={false}
                          tick={(props) => {
                            const label = String(props.payload?.value ?? '');
                            return (
                              <text x={Number(props.x) - 8} y={Number(props.y)} dy={4} textAnchor="end" fontSize={12} fill="#334155">
                                {label.length > 30 ? `${label.slice(0, 29)}…` : label}
                              </text>
                            );
                          }}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgb(241 245 249 / 0.7)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const r = payload[0].payload as (typeof byProject)[number];
                            return (
                              <ChartTooltipBox
                                title={r.name}
                                rows={[
                                  { label: 'Invoiced', value: formatINR(r.invoiced), color: CHART.series1 },
                                  { label: 'Remaining', value: formatINR(r.remaining), color: CHART.series1Light },
                                  { label: 'PO value', value: formatINR(r.value) },
                                ]}
                                footer={`${r.client} · ${r.count} PO${r.count === 1 ? '' : 's'} · ${Math.round((r.invoiced / r.value) * 100)}% invoiced`}
                              />
                            );
                          }}
                        />
                        {/* 2px surface gap between the two segments; rounded data-end only */}
                        <Bar dataKey="invoiced" stackId="a" fill={CHART.series1} stroke="#fff" strokeWidth={2} barSize={24} />
                        <Bar dataKey="remaining" stackId="a" fill={CHART.series1Light} stroke="#fff" strokeWidth={2} barSize={24} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              }
              table={
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-left">
                    <thead className="border-y border-slate-100 bg-slate-50/60">
                      <tr>
                        <th className="px-5 py-2.5">Project</th>
                        <th className="px-5 py-2.5 text-right">PO value</th>
                        <th className="px-5 py-2.5 text-right">Invoiced</th>
                        <th className="px-5 py-2.5 text-right">Remaining</th>
                        <th className="px-5 py-2.5 text-right">Used</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byProject.map((r) => (
                        <tr key={r.id}>
                          <td className="px-5 py-2.5 font-medium text-slate-900">{r.name}</td>
                          <td className="px-5 py-2.5 text-right">{formatINR(r.value)}</td>
                          <td className="px-5 py-2.5 text-right">{formatINR(r.invoiced)}</td>
                          <td className="px-5 py-2.5 text-right">{formatINR(r.remaining)}</td>
                          <td className="px-5 py-2.5 text-right">{Math.round((r.invoiced / r.value) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />

            <Card className="p-5 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Portfolio health</h3>
                <p className="text-xs text-slate-500 mt-0.5">POs by status. Select a row to see them.</p>
              </div>
              <ul className="space-y-1 -mx-2">
                {statusRows.map((r) => {
                  const Icon = r.icon;
                  return (
                    <li key={r.status}>
                      <button
                        onClick={() => onNavigate('po-tracker', { statusFilter: r.status })}
                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={cn('w-4 h-4 shrink-0', r.tone)} aria-hidden="true" />
                          <span className="flex-1 font-medium text-slate-700">{r.label}</span>
                          <span className="text-slate-400 tabular-nums">{r.count > 0 ? formatINRCompact(r.value) : ''}</span>
                          <span className="w-6 text-right font-semibold text-slate-900 tabular-nums">{r.count}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
                        </div>
                        <div className="ml-[26px] mr-5 mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className={cn('h-full rounded-full', r.bar)} style={{ width: `${(r.count / maxStatus) * 100}%` }} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          {/* MONTHLY INVOICING + EXPIRING SOON */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard
              className="xl:col-span-2"
              title="Monthly invoicing"
              subtitle={
                monthly.isRecent
                  ? 'Net invoiced per billing month, last 12 months, excl. GST'
                  : `No invoices in the last 12 months. Showing the 12 months up to the latest invoice (${monthly.months[11].label}).`
              }
              chart={
                !hasMonthly ? (
                  <EmptyState title="No invoices in the last 12 months" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                        <CartesianGrid vertical={false} stroke={CHART.grid} />
                        <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} interval={0} />
                        <YAxis
                          tickFormatter={(v) => formatINRCompact(v)}
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                          width={64}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgb(241 245 249 / 0.7)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const m = payload[0].payload as (typeof monthly.months)[number];
                            return <ChartTooltipBox title={m.label} rows={[{ label: 'Net invoiced', value: formatINR(m.amount), color: CHART.series1 }]} />;
                          }}
                        />
                        {/* one series, one colour; rounded data-end anchored to the baseline */}
                        <Bar dataKey="amount" fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              }
              table={
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-left">
                    <thead className="border-y border-slate-100 bg-slate-50/60">
                      <tr>
                        <th className="px-5 py-2.5">Month</th>
                        <th className="px-5 py-2.5 text-right">Net invoiced</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...monthly.months].reverse().map((m) => (
                        <tr key={m.key}>
                          <td className="px-5 py-2 text-slate-700">{m.label}</td>
                          <td className="px-5 py-2 text-right font-medium text-slate-900">{formatINR(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />

            <Card className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Ending in 90 days</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Start renewals early.</p>
                </div>
                <button
                  onClick={() => onNavigate('po-tracker', { statusFilter: 'Expiring Soon' })}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {expiring.length === 0 ? (
                <EmptyState title="Nothing ending soon" message="No open PO ends in the next 90 days." />
              ) : (
                <ul className="divide-y divide-slate-100 -mx-1">
                  {expiring.map(({ po, days }) => (
                    <li key={po.id}>
                      <button
                        onClick={() => openPO(po.id)}
                        className="w-full flex items-center gap-3 px-1 py-2.5 text-left hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        <div
                          className={cn(
                            'w-11 shrink-0 rounded-lg py-1 text-center border',
                            days <= 14 ? 'bg-red-50 border-red-200 text-red-700' : days <= 30 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'
                          )}
                        >
                          <div className="text-sm font-semibold leading-4 tabular-nums">{days}</div>
                          <div className="text-[9px] uppercase tracking-wide">days</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 truncate">{po.poNumber}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {po.projectName} · ends {formatDate(po.expiryDate)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-medium text-slate-900 tabular-nums">{formatINRCompact(po.remainingBalanceExclGst)}</div>
                          <div className="text-[10px] text-slate-400">left</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* RECENT PURCHASE ORDERS */}
          <section className="bg-white rounded-xl border border-slate-200/70 shadow-[var(--shadow-card)] overflow-hidden">
            <header className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Recent purchase orders</h3>
                <p className="text-xs text-slate-500 mt-0.5">Newest first, by start date</p>
              </div>
              <button
                onClick={() => onNavigate('po-tracker')}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </header>
            {recent.length === 0 ? (
              <EmptyState title="No purchase orders yet" message="Purchase orders will appear here once they are added." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/70 border-y border-slate-100">
                    <tr>
                      <th className="pl-5 pr-3 py-2.5">PO</th>
                      <th className="px-3 py-2.5">Period</th>
                      <th className="px-3 py-2.5 text-right">PO value</th>
                      <th className="px-3 py-2.5 w-48">Invoiced</th>
                      <th className="px-3 py-2.5 text-right">Remaining</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="pl-3 pr-5 py-2.5" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recent.map((po) => {
                      const used = po.amountExclGst > 0 ? 1 - po.remainingBalanceExclGst / po.amountExclGst : 0;
                      return (
                        <tr key={po.id} onClick={() => openPO(po.id)} className="cursor-pointer group">
                          <td className="pl-5 pr-3 py-3">
                            <div className="font-semibold text-slate-900">{po.poNumber}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-64">{po.projectName}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                            {formatDate(po.startDate)} – {formatDate(po.expiryDate)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-slate-900">{formatINR(po.amountExclGst)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <Meter value={used} tone={used >= 0.85 ? 'warn' : 'brand'} label={`${po.poNumber} invoiced`} />
                              <span className="w-9 text-right text-[11px] text-slate-600">{Math.round(used * 100)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-slate-900">{formatINR(po.remainingBalanceExclGst)}</td>
                          <td className="px-3 py-3">
                            <Badge status={po.status} />
                          </td>
                          <td className="pl-3 pr-5 py-3 text-right">
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
