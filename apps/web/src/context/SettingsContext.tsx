import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { AlertSettings, DEFAULT_ALERT_SETTINGS, POAlert, alertsForUser, buildPOAlerts } from '../lib/poAlerts';
import { useData } from './DataContext';
import { useRole } from './RoleContext';

// Alert settings and which alerts each user has read. Saved in this browser (demo mode).

const STORAGE_KEYS = {
  ALERT_SETTINGS: 'primestar_alert_settings',
  READ_ALERTS: 'primestar_read_alerts', // { [userId]: alertId[] }
};

function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ALERT_SETTINGS);
    if (!raw) return DEFAULT_ALERT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ALERT_SETTINGS,
      ...parsed,
      recipients: {
        expiry: Array.from(new Set([...(parsed?.recipients?.expiry || []), ...DEFAULT_ALERT_SETTINGS.recipients.expiry])),
        low_balance: Array.from(new Set([...(parsed?.recipients?.low_balance || []), ...DEFAULT_ALERT_SETTINGS.recipients.low_balance])),
        milestone: Array.from(new Set([...(parsed?.recipients?.milestone || []), ...DEFAULT_ALERT_SETTINGS.recipients.milestone])),
        exhausted: Array.from(new Set([...(parsed?.recipients?.exhausted || []), ...DEFAULT_ALERT_SETTINGS.recipients.exhausted])),
        expired: Array.from(new Set([...(parsed?.recipients?.expired || []), ...DEFAULT_ALERT_SETTINGS.recipients.expired])),
      },
    };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: settings still apply for this session.
  }
}

interface SettingsContextType {
  alertSettings: AlertSettings;
  updateAlertSettings: (next: AlertSettings) => void;
  resetAlertSettings: () => void;
  allAlerts: POAlert[]; // every alert, for admins
  myAlerts: POAlert[]; // alerts addressed to the current user's roles
  isRead: (alertId: string) => boolean;
  markRead: (alertId: string) => void;
  markAllRead: (alertIds: string[]) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { purchaseOrders } = useData();
  const { currentAppUser, can } = useRole();

  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => loadAlertSettings());
  const [readAlerts, setReadAlerts] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.READ_ALERTS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => save(STORAGE_KEYS.ALERT_SETTINGS, alertSettings), [alertSettings]);
  useEffect(() => save(STORAGE_KEYS.READ_ALERTS, readAlerts), [readAlerts]);

  const allAlerts = useMemo(() => buildPOAlerts(purchaseOrders, alertSettings), [purchaseOrders, alertSettings]);
  
  const canSeeAllAlerts = can('settings.manage') || can('po.view');
  const myAlerts = useMemo(() => {
    const roleAlerts = alertsForUser(allAlerts, currentAppUser.roleIds);
    if (canSeeAllAlerts && roleAlerts.length === 0) {
      return allAlerts;
    }
    return roleAlerts;
  }, [allAlerts, currentAppUser.roleIds, canSeeAllAlerts]);

  const mine = readAlerts[currentAppUser.id] || [];
  const isRead = (alertId: string) => mine.includes(alertId);
  const markAllRead = (alertIds: string[]) =>
    setReadAlerts((prev) => ({
      ...prev,
      [currentAppUser.id]: [...new Set([...(prev[currentAppUser.id] || []), ...alertIds])],
    }));
  const markRead = (alertId: string) => markAllRead([alertId]);

  return (
    <SettingsContext.Provider
      value={{
        alertSettings,
        updateAlertSettings: setAlertSettings,
        resetAlertSettings: () => setAlertSettings(DEFAULT_ALERT_SETTINGS),
        allAlerts,
        myAlerts,
        isRead,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
