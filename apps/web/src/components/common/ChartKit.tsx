import React, { ReactNode, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// Shared chart pieces so every chart follows the same rules:
// recessive solid grid, text in text colours (never series colours), a legend for 2+ series,
// a tooltip that enhances (not gates) the values, and a table view for every chart.

// Hex, not CSS variables: recharts writes these as SVG attributes, which can't resolve var().
// Validated as an ordinal pair (one hue, monotone lightness, light end ≥ 2:1 on the surface).
export const CHART = {
  series1: '#2a78d6', // invoiced / primary series
  series1Light: '#86b6ef', // remaining (same hue, lighter step)
  grid: '#e8ecf1',
  axisText: '#64748b',
  tick: { fontSize: 11, fill: '#64748b' },
};

export const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: color }} aria-hidden="true" />
    {label}
  </span>
);

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

// Rendered by recharts' <Tooltip content={...}>; keeps the same look on every chart.
export const ChartTooltipBox: React.FC<{ title: string; rows: TooltipRow[]; footer?: string }> = ({
  title,
  rows,
  footer,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-[0_8px_24px_-6px_rgb(15_23_42/0.18)] text-xs min-w-44">
    <div className="font-semibold text-slate-900 mb-1">{title}</div>
    <div className="space-y-0.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-500">
            {r.color && <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: r.color }} />}
            {r.label}
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
    {footer && <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[11px] text-slate-500">{footer}</div>}
  </div>
);

// Thin progress meter: one hue track + fill. Value 0–1.
export const Meter: React.FC<{ value: number; tone?: 'brand' | 'warn' | 'danger'; className?: string; label?: string }> = ({
  value,
  tone = 'brand',
  className,
  label,
}) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = tone === 'danger' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-[var(--color-chart-1)]';
  return (
    <div
      className={cn('h-1.5 w-full min-w-16 flex-1 rounded-full bg-slate-100 overflow-hidden', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
};

interface ChartCardProps {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  actions?: ReactNode;
  chart: ReactNode;
  table?: ReactNode; // every chart has a table twin
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, legend, actions, chart, table, className }) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section
      className={cn(
        'bg-white rounded-xl border border-slate-200/70 shadow-[var(--shadow-card)] p-5 flex flex-col gap-4',
        className
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {table && (
            <div className="flex p-0.5 rounded-lg bg-slate-100" role="tablist" aria-label="View">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors',
                    view === v ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.08)]' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {v === 'chart' ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                  {v === 'chart' ? 'Chart' : 'Table'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {legend && view === 'chart' && <div className="flex flex-wrap items-center gap-4 -mt-1">{legend}</div>}
      <div className="flex-1 min-h-0">{view === 'chart' || !table ? chart : table}</div>
    </section>
  );
};
