import React, { useState, ReactNode } from 'react';
import { useRole } from '../../context/RoleContext';
import { useSettings } from '../../context/SettingsContext';
import { canOpenTab } from '../../lib/navAccess';
import { getInitials } from '../../types/roles';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  DollarSign,
  FolderKanban,
  Users,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Search,
  ShieldCheck,
  FileSpreadsheet,
  Upload,
  BellRing,
  KeyRound,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { ALERT_TYPE_LABELS, POAlert } from '../../lib/poAlerts';
import { Modal, Badge, Button } from '../common/UIComponents';

interface AdminLayoutProps {
  currentTab: string;
  onNavigate: (tab: string, params?: any) => void;
  onSignOut: () => void;
  onChangePassword: () => void;
  children: ReactNode;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'PO Management / Projects',
  pos: 'PO Management / Purchase Orders',
  'po-tracker': 'PO Management / Purchase Orders',
  invoices: 'PO Management / Invoices',
  proformas: 'PO Management / Proforma Invoices',
  'proforma-invoices': 'PO Management / Proforma Invoices',
  documents: 'PO Management / Documents',
  assignments: 'PO Management / Employee Assignments',
  notifications: 'Notifications',
  import: 'Administration / Data Import',
  'data-import': 'Administration / Data Import',
  'alert-settings': 'Administration / Alert Settings',
  'users-roles': 'Administration / Users & Roles',
};

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onNavigate,
  onSignOut,
  onChangePassword,
  children,
}) => {
  const { currentUser, roleLabel, can } = useRole();
  const { myAlerts, isRead, markRead, markAllRead } = useSettings();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [selectedPreviewAlert, setSelectedPreviewAlert] = useState<POAlert | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  const unreadAlerts = myAlerts.filter((a) => !isRead(a.id));
  const visible = (tab: string) => canOpenTab(tab, can);
  const userInitials = getInitials(currentUser.name);

  // Grouped Navigation Items matching role permissions
  const navGroups = [
    {
      groupTitle: 'MAIN',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
        { id: 'notifications', label: 'Notifications', icon: BellRing, visible: visible('notifications') },
      ],
    },
    {
      groupTitle: 'PO MANAGEMENT',
      items: [
        { id: 'projects', label: 'Projects', icon: Briefcase, visible: visible('projects') },
        { id: 'pos', label: 'Purchase Orders', icon: FileText, visible: visible('pos') },
        { id: 'invoices', label: 'Invoices', icon: DollarSign, visible: visible('invoices') },
        { id: 'proformas', label: 'Proforma Invoices', icon: FileSpreadsheet, visible: visible('proformas') },
        { id: 'documents', label: 'Documents', icon: FolderKanban, visible: visible('documents') },
        { id: 'assignments', label: 'Employee Assignments', icon: Users, visible: visible('assignments') },
      ],
    },
    {
      groupTitle: 'ADMINISTRATION',
      items: [
        { id: 'users-roles', label: 'Users & Roles', icon: ShieldCheck, visible: visible('users-roles') },
        { id: 'import', label: 'Data Import', icon: Upload, visible: visible('import') },
        { id: 'alert-settings', label: 'Alert Settings', icon: BellRing, visible: visible('alert-settings') },
      ],
    },
  ];

  return (
    <div className="h-screen text-slate-900 flex flex-col font-sans antialiased">
      <div className="flex-1 flex overflow-hidden">
        {/* DESKTOP SIDEBAR (~250px WIDE, DARK NAVY) */}
        <aside className="hidden lg:flex w-[250px] bg-[#070E20] text-slate-300 border-r border-slate-800/80 flex-col shrink-0 z-30 select-none">
          {/* BRAND LOGO HEADER */}
          <div className="p-4 border-b border-slate-800/80 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-blue-500/20">
              ★
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight block leading-none">
                PRIME STAR
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                HR MANAGEMENT SYSTEM
              </span>
            </div>
          </div>

          {/* GROUPED SIDEBAR NAVIGATION */}
          <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter((item) => item.visible);
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.groupTitle} className="space-y-1">
                  <div className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                    {group.groupTitle}
                  </div>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                          'relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left whitespace-nowrap cursor-pointer',
                          isActive
                            ? 'bg-white/[0.08] text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-indigo-400'
                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-indigo-300' : 'text-slate-500')} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* SIDEBAR FOOTER (USER BRANDING SYNCHRONIZED WITH CURRENT USER) */}
          <div className="p-3 border-t border-slate-800/80 bg-[#050A18]">
            <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{roleLabel}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* WHITE TOP NAVIGATION BAR */}
          <header className="h-14 bg-white border-b border-slate-200/90 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
            {/* LEFT: BREADCRUMBS & MOBILE MENU TRIGGER */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-900 capitalize">
                  {TAB_TITLES[currentTab] || currentTab.replace('-', ' ')}
                </span>
              </div>
            </div>

            {/* CENTER: GLOBAL SEARCH INPUT */}
            <div className="hidden md:flex items-center relative max-w-sm w-full">
              <Search className="w-4 h-4 absolute left-3 text-slate-400" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Search anything... (Ctrl + K)"
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-colors text-slate-900 placeholder-slate-400"
              />
            </div>

            {/* RIGHT: NOTIFICATIONS & USER PROFILE MENU */}
            <div className="flex items-center gap-3 shrink-0">
              {/* NOTIFICATION BELL */}
              <div className="relative">
                <button
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative transition-colors cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadAlerts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      {unreadAlerts.length > 9 ? '9+' : unreadAlerts.length}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs">
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Notifications</span>
                        {unreadAlerts.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            {unreadAlerts.length} unread
                          </span>
                        )}
                      </div>
                      {unreadAlerts.length > 0 ? (
                        <button
                          onClick={() => markAllRead(unreadAlerts.map((a) => a.id))}
                          className="text-[11px] text-blue-600 font-semibold hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">All caught up</span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {myAlerts.slice(0, 8).map((a) => {
                        const unread = !isRead(a.id);
                        return (
                          <div
                            key={a.id}
                            onClick={() => {
                              markRead(a.id);
                              setNotifDropdownOpen(false);
                              if (a.poId) {
                                onNavigate('pos', { poId: a.poId });
                              } else {
                                onNavigate('notifications');
                              }
                            }}
                            className={cn(
                              'p-3 hover:bg-slate-50 cursor-pointer transition-colors border-l-4 flex flex-col gap-1',
                              unread ? 'bg-blue-50/50 border-l-blue-600 font-medium' : 'border-l-transparent bg-white'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={cn(
                                    'w-2 h-2 rounded-full shrink-0',
                                    a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                                  )}
                                />
                                <span className="font-bold text-slate-900 truncate text-[12px]">{a.title}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {unread && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                    UNREAD
                                  </span>
                                )}
                                <button
                                  type="button"
                                  title="View full details modal"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markRead(a.id);
                                    setSelectedPreviewAlert(a);
                                    setNotifDropdownOpen(false);
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed line-clamp-2 pl-3.5">{a.message}</p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pl-3.5 pt-0.5 font-normal">
                              <span>{a.projectName || a.poNumber}</span>
                              <span>Relates to {formatDate(a.date)}</span>
                            </div>
                          </div>
                        );
                      })}
                      {myAlerts.length === 0 && (
                        <div className="p-8 text-center text-slate-400 font-medium">No alerts for your role right now.</div>
                      )}
                    </div>
                    {visible('notifications') && (
                      <div className="p-2 text-center border-t border-slate-100 bg-slate-50/50">
                        <button
                          onClick={() => {
                            setNotifDropdownOpen(false);
                            onNavigate('notifications');
                          }}
                          className="w-full py-1 text-center text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          View all notifications ({myAlerts.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SYNCHRONIZED USER PROFILE DROPDOWN */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                    {userInitials}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-bold text-slate-900 leading-tight">{currentUser.name}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{roleLabel}</div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="font-bold text-slate-900">{currentUser.name}</div>
                      <div className="text-[11px] text-blue-700 font-semibold">{roleLabel}</div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">{currentUser.email}</div>
                    </div>

                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        onChangePassword();
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Change password</span>
                    </button>

                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        onSignOut();
                      }}
                      className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-600" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* MAIN PAGE VIEWPORT */}
          <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-7">
            {children}
          </main>
        </div>
      </div>

      {/* MOBILE MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          <div className="relative flex-1 max-w-xs w-full bg-[#070E20] text-slate-200 flex flex-col p-4 shadow-2xl z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="font-bold text-white text-sm">PRIME STAR HRMS</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-4 overflow-y-auto">
              {navGroups.map((group) => {
                const visibleItems = group.items.filter((item) => item.visible);
                if (visibleItems.length === 0) return null;

                return (
                  <div key={group.groupTitle} className="space-y-1">
                    <div className="px-2 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                      {group.groupTitle}
                    </div>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onNavigate(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer',
                            currentTab === item.id ? 'bg-white/[0.08] text-white font-semibold' : 'text-slate-400'
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* NOTIFICATION PREVIEW MODAL */}
      {selectedPreviewAlert && (
        <Modal
          isOpen={!!selectedPreviewAlert}
          onClose={() => setSelectedPreviewAlert(null)}
          title="Notification Details"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Badge
                  status={
                    selectedPreviewAlert.severity === 'critical'
                      ? 'Expiring'
                      : selectedPreviewAlert.severity === 'warning'
                      ? 'Pending'
                      : 'Active'
                  }
                >
                  {ALERT_TYPE_LABELS[selectedPreviewAlert.type] || selectedPreviewAlert.type}
                </Badge>
                {!isRead(selectedPreviewAlert.id) ? (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">UNREAD</span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">READ</span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {formatDate(selectedPreviewAlert.date)}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">{selectedPreviewAlert.title}</h4>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                {selectedPreviewAlert.message}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50/60 p-3 rounded-lg border border-slate-200 text-slate-700">
              {selectedPreviewAlert.poNumber && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PO Number</span>
                  <span className="font-semibold text-slate-900">{selectedPreviewAlert.poNumber}</span>
                </div>
              )}
              {selectedPreviewAlert.projectName && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Project</span>
                  <span className="font-semibold text-slate-900">{selectedPreviewAlert.projectName}</span>
                </div>
              )}
              {selectedPreviewAlert.date && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Relates To Date</span>
                  <span className="font-semibold text-slate-900">{formatDate(selectedPreviewAlert.date)}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alert Type</span>
                <span className="font-semibold text-slate-900 capitalize">{selectedPreviewAlert.type.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {!isRead(selectedPreviewAlert.id) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markRead(selectedPreviewAlert.id)}
                >
                  Mark as read
                </Button>
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">Marked read</span>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPreviewAlert(null)}
                >
                  Close
                </Button>
                {selectedPreviewAlert.poId && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ExternalLink className="w-3.5 h-3.5" />}
                    onClick={() => {
                      markRead(selectedPreviewAlert.id);
                      const targetPoId = selectedPreviewAlert.poId;
                      setSelectedPreviewAlert(null);
                      onNavigate('pos', { poId: targetPoId });
                    }}
                  >
                    Open PO
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
