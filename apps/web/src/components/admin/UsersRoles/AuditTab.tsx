import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAccess } from '../../../context/AccessContext';

export const AuditTab: React.FC = () => {
  const { audit } = useAccess();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audit;
    return audit.filter((e) =>
      [e.actorName, e.action, e.target, e.details].some((v) => v.toLowerCase().includes(q))
    );
  }, [audit, search]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200/80">
        <p className="text-slate-600 flex-1">
          Every change to users and roles, newest first. Entries cannot be edited or deleted.
        </p>
        <div className="relative md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search who, action or details"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3 whitespace-nowrap">When</th>
              <th className="p-3">Who</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="p-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">{fmt(e.at)}</td>
                <td className="p-3 font-semibold text-slate-900">{e.actorName}</td>
                <td className="p-3 whitespace-nowrap">{e.action}</td>
                <td className="p-3 text-slate-700">{e.target}</td>
                <td className="p-3 text-slate-600">{e.details}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
