import React, { useState } from 'react';
import { Plus, Lock, Pencil, Eye, Trash2 } from 'lucide-react';
import { useRole } from '../../../context/RoleContext';
import { useAccess } from '../../../context/AccessContext';
import { useNotification } from '../../../context/NotificationContext';
import { AppRole, ALL_PERMISSION_KEYS } from '../../../types/access';
import { checkCanDeleteRole, checkCanEditRole, usersWithRole } from '../../../lib/accessRules';
import { Badge, Button, Modal } from '../../common/UIComponents';
import { RoleEditorModal } from './RoleEditorModal';

export const RolesTab: React.FC = () => {
  const { currentAppUser } = useRole();
  const { roles, users, deleteRole } = useAccess();
  const { showToast } = useNotification();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AppRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<AppRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openNew = () => {
    setEditingRole(null);
    setEditorOpen(true);
  };

  const openRole = (r: AppRole) => {
    setEditingRole(r);
    setEditorOpen(true);
  };

  const handleDelete = async (r: AppRole) => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteRole(currentAppUser, r.id);
    setDeleting(false);
    setDeletingRole(null);
    if (result.ok) showToast('Role deleted', `${r.name} was removed.`);
    else showToast('Not allowed', result.error, 'error');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 gap-3">
        <p className="text-slate-600">
          A role is a named set of permissions. Built-in roles can be adjusted; custom roles can be added for special
          cases.
        </p>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openNew}>
          New Role
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3">Role</th>
              <th className="p-3">Type</th>
              <th className="p-3">Permissions</th>
              <th className="p-3">Users</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((r) => {
              const holders = usersWithRole(r.id, users).length;
              const editBlocked = checkCanEditRole(currentAppUser, r, roles);
              const deleteBlocked = checkCanDeleteRole(currentAppUser, r, roles, users);
              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="p-3">
                    <div className="font-semibold text-slate-900 flex items-center gap-1">
                      {r.name}
                      {r.locked && <Lock className="w-3 h-3 text-slate-400" />}
                    </div>
                    <div className="text-[11px] text-slate-500">{r.description}</div>
                  </td>
                  <td className="p-3">
                    {r.locked ? (
                      <Badge status="neutral">Locked</Badge>
                    ) : r.builtIn ? (
                      <Badge status="neutral">Built-in</Badge>
                    ) : (
                      <Badge status="info" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                        Custom
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-700">
                    {r.permissions.length} / {ALL_PERMISSION_KEYS.length}
                  </td>
                  <td className="p-3 font-mono text-slate-700">{holders}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={editBlocked ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        onClick={() => openRole(r)}
                      >
                        {editBlocked ? 'View' : 'Edit'}
                      </Button>
                      {!r.builtIn && (
                        <span title={deleteBlocked || 'Delete this role'}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            className="text-red-600"
                            disabled={!!deleteBlocked}
                            onClick={() => setDeletingRole(r)}
                          >
                            Delete
                          </Button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editorOpen && <RoleEditorModal role={editingRole} onClose={() => setEditorOpen(false)} />}

      {deletingRole && (
        <Modal isOpen onClose={() => setDeletingRole(null)} title="Delete role?" maxWidth="md">
          <div className="space-y-4 text-xs">
            <p className="text-slate-700">
              <strong>{deletingRole.name}</strong> will be removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setDeletingRole(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete(deletingRole)} loading={deleting}>
                {deleting ? 'Deleting…' : 'Delete Role'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
