// Quick sign-in by role, so each role can be tried with one click on the login page.
//
// It is the real sign-in: the button sends the account's email and the shared dev password to `/api/auth/login`.
// It is off unless one of these is true:
//   - `vite dev` (local development), or
//   - the build was made with `VITE_QUICK_LOGIN=true` (set in Vercel's project environment for a test deployment).
// The password comes from `VITE_DEV_PASSWORD`. Variables starting with VITE_ are written into the built JavaScript,
// so anyone who can open the site can read it: use this only for a test deployment with test accounts.

const ENABLED = import.meta.env.DEV || import.meta.env.VITE_QUICK_LOGIN === 'true';

export const DEV_PASSWORD: string | undefined = ENABLED
  ? (import.meta.env.VITE_DEV_PASSWORD as string | undefined) || undefined
  : undefined;

/** Role label (as the login page shows it) to the account for that role. */
export const DEV_ACCOUNTS: Record<string, string> = ENABLED
  ? {
      CEO: 'ceo@primestar.test',
      'HR Head': 'hr.head@primestar.test',
      'HR Executive': 'hr@primestar.test',
      'Finance Manager': 'finance@primestar.test',
      'PO Admin': 'po.admin@primestar.test',
      'Project Manager': 'pm@primestar.test',
    }
  : {};

export const devLoginEnabled = (): boolean => DEV_PASSWORD !== undefined;
