import React, { useState } from 'react';
import { Eye, EyeOff, FileText } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { UserRole, DEMO_USERS } from '../../types/roles';
import { AppUser } from '../../types/access';
import { useAccess } from '../../context/AccessContext';
import { DEV_ACCOUNTS, DEV_PASSWORD, devLoginEnabled } from '../../lib/devLogin';

interface LoginPageProps {
  onLoginSuccess: (user: AppUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [quickLoginError, setQuickLoginError] = useState<string | null>(null);
  const [quickSigningIn, setQuickSigningIn] = useState<string | null>(null);

  const [signingIn, setSigningIn] = useState(false);

  // Users & Roles decides who may log in: disabled, invited and locked accounts are blocked,
  // and 5 wrong passwords lock the account for 15 minutes.
  const { users: accessUsers, authenticate, checkLoginAllowed, mode } = useAccess();

  // Demo shortcut: sign straight in as the sample person for a role (still respects account status).
  const demoLogin = (role: UserRole): string | null => {
    const demo = DEMO_USERS.find((u) => u.role === role);
    const account = demo && accessUsers.find((a) => a.email.toLowerCase() === demo.email.toLowerCase());
    if (!account) return 'No sample account for this role.';
    const allowed = checkLoginAllowed(account.id);
    if (!allowed.ok) return allowed.error;
    onLoginSuccess(account);
    return null;
  };

  // Admin roles for Phase 1 (PO Management). The Employee role returns with the Employee Portal.
  const allRoles: UserRole[] = [
    'CEO',
    'HR Head',
    'HR Executive',
    'Finance Manager',
    'PO Admin',
    'Project Manager',
  ];

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email ID is required';
    } else if (!email.includes('@') || !email.includes('.')) {
      newErrors.email = 'Please enter a valid email address (e.g. yourname@primestar.com)';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSigningIn(true);
    const result = await authenticate(email, password);
    setSigningIn(false);
    if (!result.ok) {
      setErrors({ password: result.error });
      return;
    }
    onLoginSuccess(result.user);
  };

  // In demo mode the role picks a sample account. With the backend it is a real sign-in with the shared dev password.
  const handleQuickDemoLogin = async (role: UserRole) => {
    if (mode === 'demo') {
      const error = demoLogin(role);
      setQuickLoginError(error ? `${role}: ${error}` : null);
      return;
    }
    const email = DEV_ACCOUNTS[role];
    if (!email || !DEV_PASSWORD) return;
    setQuickLoginError(null);
    setQuickSigningIn(role);
    const result = await authenticate(email, DEV_PASSWORD);
    setQuickSigningIn(null);
    if (!result.ok) {
      setQuickLoginError(`${role}: ${result.error} Run "pnpm db:seed" with SEED_DEV_USERS=true to create the development accounts.`);
      return;
    }
    onLoginSuccess(result.user);
  };

  return (
    <div className="min-h-[100dvh] lg:h-screen lg:max-h-screen w-full bg-slate-950 flex flex-col lg:flex-row font-sans antialiased text-slate-900 select-none overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
      {/* LEFT PANEL — COMPANY BRANDING (50% DESKTOP VIEWPORT, OPTIMIZED FOR 1440x900) */}
      <div className="w-full lg:w-1/2 relative bg-[#070E20] text-white flex flex-col justify-between p-6 lg:px-10 lg:py-8 overflow-hidden min-h-[440px] lg:min-h-full shrink-0">
        {/* CINEMATIC BACKGROUND GLOW & GLASS MESH PATTERN */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1530] via-[#081025] to-[#040814] z-0"></div>
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/2 -right-20 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-[#040814] via-transparent to-transparent z-0"></div>

        {/* ARCHITECTURAL BUILDING GRID OVERLAY */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none z-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.2) 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        ></div>

        {/* TOP BRAND LOCKUP */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600/90 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-500/20 border border-blue-400/30">
            ★
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight block leading-tight text-white">
              PRIME STAR
            </span>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest block">
              CONSULTING SERVICES
            </span>
          </div>
        </div>

        {/* MIDDLE HERO HEADLINE & CARDS */}
        <div className="relative z-10 my-auto py-4 max-w-lg space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl xl:text-4xl font-black text-white tracking-tight leading-[1.15]">
              People. Projects.
              <br />
              Progress.
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-normal leading-relaxed max-w-md">
              One platform for purchase orders, people and performance.
            </p>
          </div>

          {/* FEATURE CARD (Phase 1: PO Tracking) */}
          <div className="space-y-2.5 pt-1">
            {/* CARD 1: PO TRACKING */}
            <div className="p-3 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-700/50 flex items-center gap-3 shadow-xs hover:border-slate-600/60 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">PO Tracking</h4>
                <p className="text-[11px] text-slate-300">Track value, expiry and utilization.</p>
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM BRAND FOOTER (LEFT) */}
        <div className="relative z-10 text-[10px] text-slate-500 pt-2">
          Prime Star HRMS v{__APP_VERSION__}
        </div>
      </div>

      {/* RIGHT PANEL — LOGIN FORM (OPTIMIZED FOR 1440x900 VIEWPORT FIT) */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-between p-6 lg:px-10 lg:py-8 min-h-full overflow-y-auto">
        <div className="max-w-md w-full mx-auto my-auto space-y-4 py-2">
          {/* LOGO & HEADING */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                ★
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 tracking-tight block leading-none">
                  PRIME STAR
                </span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block mt-0.5">
                  HR MANAGEMENT SYSTEM
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Sign in to your account</p>
            </div>
          </div>

          {/* LOGIN FORM */}
          <form onSubmit={handleSignInSubmit} className="space-y-3 text-xs">
            {/* EMAIL INPUT */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email ID</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                placeholder="yourname@primestar.com"
                className={`w-full px-3.5 py-2 text-xs bg-white border rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors text-slate-900 placeholder-slate-400 ${
                  errors.email ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
                }`}
              />
              {errors.email && <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.email}</p>}
            </div>

            {/* PASSWORD INPUT WITH MASK TOGGLE */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  placeholder="••••••••••••"
                  className={`w-full px-3.5 py-2 pr-10 text-xs bg-white border rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors text-slate-900 placeholder-slate-400 ${
                    errors.password ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.password}</p>
              )}
            </div>

            {/* REMEMBER ME & FORGOT PASSWORD */}
            <div className="flex items-center justify-between pt-0.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs">Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => setForgotModalOpen(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* SIGN IN BUTTON */}
            <button
              type="submit"
              disabled={signingIn}
              className="w-full bg-[#1D4ED8] hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-xs shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 active:scale-[0.99] disabled:opacity-60"
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
            {mode === 'demo' && (
              <p className="text-[10px] text-slate-400 text-center -mt-1">
                Demo: sample accounts accept any password until a password is set for them.
              </p>
            )}
          </form>

          {/* Quick sign-in by role, for development. Demo mode: sample accounts. With the backend: a real sign-in with the shared dev password (needs VITE_DEV_PASSWORD, `vite dev` only). */}
          {(mode === 'demo' || devLoginEnabled()) && (
            <div className="pt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => void handleQuickDemoLogin(role)}
                    disabled={quickSigningIn !== null}
                    className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 rounded-md border border-slate-200 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    {quickSigningIn === role ? 'Signing in…' : role}
                  </button>
                ))}
              </div>
              {quickLoginError && <p className="text-[11px] text-red-600 font-medium">{quickLoginError}</p>}
            </div>
          )}
        </div>

        {/* COPYRIGHT FOOTER */}
        <div className="text-center text-[11px] text-slate-400 pt-2 shrink-0">
          © 2026 Prime Star Consulting Services Pvt. Ltd.
        </div>
      </div>

      {/* MODALS */}
      {forgotModalOpen && (
        <ForgotPasswordModal
          isOpen={forgotModalOpen}
          onClose={() => setForgotModalOpen(false)}
        />
      )}

    </div>
  );
};
