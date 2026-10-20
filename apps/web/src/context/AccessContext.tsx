import React, { ReactNode } from 'react';
import { USE_API } from '../lib/apiClient';
import { ApiAccessProvider } from './ApiAccessProvider';
import { MockAccessProvider } from './MockAccessProvider';

export { useAccess } from './accessTypes';
export type { AccessResult, LoginResult, TokenLookup } from './accessTypes';

/**
 * Users, roles, the audit log and sign-in. Runs against the backend unless `VITE_USE_API=false`,
 * in which case it uses sample data kept in this browser.
 */
export const AccessProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
  USE_API ? <ApiAccessProvider>{children}</ApiAccessProvider> : <MockAccessProvider>{children}</MockAccessProvider>;
