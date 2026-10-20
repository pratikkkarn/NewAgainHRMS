import React, { useState } from 'react';
import { AlertCircle, BellRing, RotateCcw, Save } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { useAccess } from '../../../context/AccessContext';
import { useNotification } from '../../../context/NotificationContext';
import {
  ALERT_TYPE_LABELS,
  AlertSettings,
  AlertType,
  DEFAULT_ALERT_SETTINGS,
  checkAlertSettings,
} from '../../../lib/poAlerts';
import { Button, Card, Input } from '../../common/UIComponents';

const ALERT_TYPES = Object.keys(ALERT_TYPE_LABELS) as AlertType[];

export const AlertSettingsView: React.FC = () => {
  const { alertSettings, updateAlertSettings } = useSettings();
  const { roles } = useAccess();
  const { showToast } = useNotification();

  const [draft, setDraft] = useState<AlertSettings>(alertSettings);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(alertSettings);

  // The Employee role has no PO access, so it is not offered as a recipient.
  const recipientRoles = roles.filter((r) => r.id !== 'role-employee');

  const setDays = (key: keyof Omit<AlertSettings, 'recipients' | 'repeatWeekly'>, value: string) =>
    setDraft((d) => ({ ...d, [key]: value === '' ? 0 : Math.round(Number(value)) }));

  const toggleRecipient = (type: AlertType, roleId: string) =>
    setDraft((d) => {
      const list = d.recipients[type];
      return {
        ...d,
        recipients: {
          ...d.recipients,
          [type]: list.includes(roleId) ? list.filter((r) => r !== roleId) : [...list, roleId],
        },
      };
    });

  const handleSave = () => {
    const problem = checkAlertSettings(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    updateAlertSettings(draft);
    showToast('Alert settings saved', 'Alerts now use the new thresholds and recipients.');
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-600" /> Alert Settings
          </h1>
          <p className="text-slate-500 mt-0.5">When PO alerts go out, and which roles receive them.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => {
              setDraft(DEFAULT_ALERT_SETTINGS);
              setError(null);
            }}
          >
            Restore defaults
          </Button>
          <Button variant="primary" icon={<Save className="w-4 h-4" />} disabled={!dirty} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Timing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="PO expiry warning (days before end)"
            type="number"
            min={1}
            max={365}
            value={draft.expiryDays || ''}
            onChange={(e) => setDays('expiryDays', e.target.value)}
          />
          <Input
            label="Low balance warning (days before run-out)"
            type="number"
            min={1}
            max={365}
            value={draft.lowBalanceDays || ''}
            onChange={(e) => setDays('lowBalanceDays', e.target.value)}
          />
          <Input
            label="Milestone: first reminder (days before)"
            type="number"
            min={1}
            max={365}
            value={draft.milestoneFirstDays || ''}
            onChange={(e) => setDays('milestoneFirstDays', e.target.value)}
          />
          <Input
            label="Milestone: second reminder (days before)"
            type="number"
            min={1}
            max={365}
            value={draft.milestoneSecondDays || ''}
            onChange={(e) => setDays('milestoneSecondDays', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-indigo-600"
            checked={draft.repeatWeekly}
            onChange={(e) => setDraft((d) => ({ ...d, repeatWeekly: e.target.checked }))}
          />
          Repeat expiry and low-balance alerts every week until the PO is renewed, closed or topped up
        </label>
      </Card>

      <Card className="space-y-3 p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h2 className="text-sm font-bold text-slate-900">Recipients</h2>
          <p className="text-slate-500 mt-0.5">
            Tick the roles that receive each alert. If a project has no manager, its alerts go to the PO Admin.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
              <tr>
                <th className="p-3 min-w-44">Alert</th>
                {recipientRoles.map((r) => (
                  <th key={r.id} className="p-3 text-center whitespace-nowrap">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ALERT_TYPES.map((t) => (
                <tr key={t}>
                  <td className="p-3 font-semibold text-slate-900">{ALERT_TYPE_LABELS[t]}</td>
                  {recipientRoles.map((r) => (
                    <td key={r.id} className="p-3 text-center">
                      <input
                        type="checkbox"
                        className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        checked={draft.recipients[t].includes(r.id)}
                        onChange={() => toggleRecipient(t, r.id)}
                        aria-label={`${ALERT_TYPE_LABELS[t]} to ${r.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Demo mode: settings are saved in this browser. The backend will store them and use them for the daily 9 AM
        alert run.
      </p>
    </div>
  );
};
