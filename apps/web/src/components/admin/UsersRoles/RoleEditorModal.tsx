import React, { useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useAccess } from '../../../context/AccessContext';
import { useNotification } from '../../../context/NotificationContext';
import {
  AppRole,
  PERMISSION_AREAS,
  PERMISSION_COLUMNS,
  PermissionArea,
  PermissionKey,
} from '../../../types/access';
import { checkCanEditRole } from '../../../lib/accessRules';
import { Button, Input, Modal } from '../../common/UIComponents';

interface RoleEditorModalProps {
  role: AppRole | null; // null = create a new custom role
  onClose: () => void;
}

// Ticking create/edit/delete in an area also ticks its View permission,
// and unticking View clears the rest of that area (except Administration,
// whose permissions are independent).
function applyDependencies(area: PermissionArea, key: PermissionKey, checked: boolean, current: PermissionKey[]) {
  let next = checked ? [...current, key] : current.filter((k) => k !== key);
  if (area.id === 'admin') return next;
  const viewKey = area.permissions.find((p) => p.column === 'view')?.key;
  if (!viewKey) return next;
  if (checked && key !== viewKey && !next.includes(viewKey)) next = [...next, viewKey];
  if (!checked && key === viewKey) {
    const areaKeys = area.permissions.map((p) => p.key);
    next = next.filter((k) => !areaKeys.includes(k));
  }
  return next;
}

export const RoleEditorModal: React.FC<RoleEditorModalProps> = ({ role, onClose }) => {
  const { currentAppUser } = useRole();
  const { roles, createRole, updateRole } = useAccess();
  const { showToast } = useNotification();

  const readOnlyReason = role ? checkCanEditRole(currentAppUser, role, roles) : null;
  const readOnly = !!readOnlyReason;

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<PermissionKey[]>(role?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (area: PermissionArea, key: PermissionKey) => {
    setPermissions((prev) => applyDependencies(area, key, !prev.includes(key), prev));
  };

  const handleSave = async () => {
    if (saving) return;
    const input = { name, description, permissions };
    setSaving(true);
    setError(null);
    const result = await (role ? updateRole(currentAppUser, role.id, input) : createRole(currentAppUser, input));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(role ? 'Role updated' : 'Role created', `${name.trim()} saved with ${permissions.length} permission(s).`);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={role ? (readOnly ? `Role: ${role.name}` : `Edit Role: ${role.name}`) : 'New Role'}
      subtitle="Tick what this role is allowed to do. Changes apply to everyone with the role."
      maxWidth="4xl"
    >
      <div className="space-y-4 text-xs">
        {readOnly && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
            <Info className="w-4 h-4 shrink-0 mt-px text-slate-500" />
            <span>{readOnlyReason}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Role name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly || !!role?.builtIn}
            helperText={role?.builtIn ? 'Built-in role names cannot be changed.' : undefined}
            required
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
          />
        </div>

        {/* PERMISSION MATRIX */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3 min-w-48">Area</th>
                {PERMISSION_COLUMNS.map((c) => (
                  <th key={c.id} className="p-3 text-center whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_AREAS.map((area) => (
                <tr key={area.id}>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{area.label}</div>
                    <div className="text-[11px] text-slate-500">{area.description}</div>
                  </td>
                  {PERMISSION_COLUMNS.map((col) => {
                    const defs = area.permissions.filter((p) => p.column === col.id);
                    return (
                      <td key={col.id} className="p-3 text-center align-middle">
                        {defs.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {defs.map((p) => (
                              <label
                                key={p.key}
                                className="inline-flex items-center gap-1.5 cursor-pointer"
                                title={p.key}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-indigo-600 w-4 h-4"
                                  checked={permissions.includes(p.key)}
                                  disabled={readOnly}
                                  onChange={() => toggle(area, p.key)}
                                  aria-label={`${area.label}: ${p.label}`}
                                />
                                {(col.id === 'other' || area.id === 'admin') && (
                                  <span className="text-slate-700 whitespace-nowrap">{p.label}</span>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-500">
          Onboarding, salary and timesheet permissions are added with Phases 2 and 3.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {role ? 'Save Role' : 'Create Role'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
