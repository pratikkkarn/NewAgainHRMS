import React from 'react';
import { AlertTriangle, CalendarClock, TrendingDown } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PurchaseOrder } from '../../../types/domain';
import { forecastRunOut } from '../../../lib/poForecast';
import { formatDate, formatINR, formatINRCompact } from '../../../lib/utils';
import { Card } from '../../common/UIComponents';
import { CHART, ChartTooltipBox, LegendItem } from '../../common/ChartKit';

const METHOD_TEXT = {
  'recent-invoices': 'Average of the last 3 invoiced months',
  'even-spend': 'Fewer than 2 months invoiced, so the PO value is spread evenly from start to end',
  exhausted: 'No balance left',
  none: 'Not enough data to forecast',
};

// Run-out forecast and month-by-month balance for one PO (FR8, FR11).
export const POForecastPanel: React.FC<{ po: PurchaseOrder }> = ({ po }) => {
  const f = forecastRunOut(po);

  // Two lines that meet at the current month: actual (solid) and projected (dashed).
  const lastActual = [...f.series].reverse().find((p) => !p.projected);
  const data = f.series.map((p) => ({
    label: p.label,
    actual: p.projected ? null : p.balance,
    projected: p.projected || p === lastActual ? p.balance : null,
  }));
  const expiryLabel = f.series.find((p) => p.month === po.expiryDate.slice(0, 7))?.label;

  const warn = f.runsOutBeforeExpiry && po.status !== 'Closed' && po.status !== 'Renewed';

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-indigo-600" /> Balance Forecast
        </h3>
        <span className="text-[11px] text-slate-500">{METHOD_TEXT[f.method]}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
          <span className="text-[11px] font-medium text-slate-500 block">Monthly billing rate</span>
          <span className="figure font-semibold text-slate-900 text-base">{formatINR(f.monthlyBurn)}</span>
        </div>
        <div className={`p-3 rounded-lg border ${warn ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200/70'}`}>
          <span className="text-[11px] font-medium text-slate-500 block">Projected run-out</span>
          <span className={`figure font-semibold text-base ${warn ? 'text-amber-800' : 'text-slate-900'}`}>
            {f.runOutDate ? formatDate(f.runOutDate) : '—'}
          </span>
          {f.daysToRunOut !== null && f.daysToRunOut > 0 && (
            <span className="text-[11px] text-slate-500 block">in about {f.daysToRunOut} days</span>
          )}
        </div>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
          <span className="text-[11px] font-medium text-slate-500 block">PO ends</span>
          <span className="figure font-semibold text-slate-900 text-base flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> {formatDate(po.expiryDate)}
          </span>
        </div>
      </div>

      {warn && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            At the current rate the balance runs out before the PO ends. Plan a renewal or a PO value increase.
          </span>
        </div>
      )}

      {data.length > 1 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <LegendItem color={CHART.series1} label="Balance" />
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              <span className="w-4 border-t-2 border-dashed border-[#2a78d6]" aria-hidden="true" />
              Projected
            </span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickFormatter={(v) => formatINRCompact(v)} tick={CHART.tick} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    const value = d.actual ?? d.projected;
                    return (
                      <ChartTooltipBox
                        title={d.label}
                        rows={[{ label: d.actual !== null ? 'Balance' : 'Projected balance', value: value === null ? '—' : formatINR(value), color: CHART.series1 }]}
                      />
                    );
                  }}
                />
                {expiryLabel && (
                  <ReferenceLine x={expiryLabel} stroke="#94a3b8" label={{ value: 'PO ends', position: 'insideTopRight', fontSize: 11, fill: '#64748b' }} />
                )}
                {/* Same hue for both: projection is the same quantity, shown dashed */}
                <Line type="linear" dataKey="actual" name="Balance" stroke={CHART.series1} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
                <Line type="linear" dataKey="projected" name="Projected" stroke={CHART.series1} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-center py-6">The chart appears once the PO has run for at least a month.</p>
      )}
    </Card>
  );
};
