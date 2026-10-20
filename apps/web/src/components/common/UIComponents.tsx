import React, { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle, Loader2 } from 'lucide-react';
import { useNotification, ToastType } from '../../context/NotificationContext';

// --- BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children?: ReactNode;
  /** Shows a spinner instead of the icon and blocks clicks, for actions that wait on the server. */
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className,
  disabled,
  loading = false,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer whitespace-nowrap shrink-0 active:translate-y-px';

  const variantStyles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-[0_1px_2px_rgb(15_23_42/0.12)] border border-indigo-700/20',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200',
    outline: 'bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 shadow-[0_1px_2px_rgb(15_23_42/0.05)]',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-[0_1px_2px_rgb(15_23_42/0.12)] border border-transparent',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_1px_2px_rgb(15_23_42/0.12)] border border-transparent',
  };

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 h-8',
    md: 'text-xs md:text-sm px-4 py-2 gap-2 h-9',
    lg: 'text-sm px-5 py-2.5 gap-2.5 h-10',
  };

  return (
    <button
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], loading && 'disabled:opacity-100 disabled:cursor-wait', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
};

// --- BADGE ---
export type BadgeVariant =
  | 'active'
  | 'expiring'
  | 'low_balance'
  | 'expired'
  | 'renewed'
  | 'closed'
  | 'pending'
  | 'neutral'
  | 'info';

interface BadgeProps {
  status: string | BadgeVariant;
  className?: string;
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ status, className, children }) => {
  let styles = 'bg-slate-50 text-slate-700 border-slate-200';
  let dot = 'bg-slate-400';
  const norm = String(status).toLowerCase();

  if (norm.includes('inactive')) {
    // falls through to neutral
  } else if (norm.includes('active') || norm.includes('approved') || norm.includes('paid') || norm.includes('joined') || norm.includes('verified')) {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
    dot = 'bg-emerald-500';
  } else if (norm.includes('expiring') || norm.includes('low balance') || norm.includes('correction') || norm.includes('warning') || norm.includes('unlock') || norm.includes('pending') || norm.includes('invited')) {
    styles = 'bg-amber-50 text-amber-800 border-amber-200/70';
    dot = 'bg-amber-500';
  } else if (norm.includes('expired') || norm.includes('rejected') || norm.includes('cancelled') || norm.includes('declined') || norm.includes('fully utilized') || norm.includes('disabled')) {
    styles = 'bg-red-50 text-red-700 border-red-200/70';
    dot = 'bg-red-500';
  } else if (norm.includes('renewed') || norm.includes('submitted') || norm.includes('review') || norm.includes('offer')) {
    styles = 'bg-indigo-50 text-indigo-700 border-indigo-200/70';
    dot = 'bg-indigo-500';
  } else if (norm.includes('closed')) {
    styles = 'bg-slate-100 text-slate-600 border-slate-200';
    dot = 'bg-slate-500';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5 rounded-full text-[11px] leading-4 font-medium border whitespace-nowrap shrink-0',
        styles,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} aria-hidden="true" />
      {children || status}
    </span>
  );
};

// --- CARD ---
export const Card: React.FC<{ children: ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200/70 shadow-[var(--shadow-card)] p-5 transition-shadow',
        onClick && 'cursor-pointer hover:shadow-[var(--shadow-card-hover)]',
        className
      )}
    >
      {children}
    </div>
  );
};

// --- STAT CARD ---
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  secondary?: string;
  icon?: ReactNode;
  trend?: string;
  trendPositive?: boolean;
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  secondary,
  icon,
  trend,
  trendPositive,
  className,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200/70 p-4 shadow-[var(--shadow-card)] transition-all cursor-default',
        onClick && 'cursor-pointer hover:shadow-[var(--shadow-card-hover)] hover:border-slate-300/80',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        {icon && <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 text-slate-600 flex items-center justify-center shrink-0">{icon}</div>}
      </div>
      <div className="figure text-2xl font-semibold text-slate-900">{value}</div>
      {(subtitle || trend || secondary) && (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500 leading-tight">
          {trend && (
            <span
              className={cn(
                'font-medium',
                trendPositive ? 'text-emerald-600' : 'text-red-600'
              )}
            >
              {trend}
            </span>
          )}
          {subtitle && <span className="truncate">{subtitle}</span>}
          {secondary && <span className="text-[11px] font-semibold text-amber-700 truncate">{secondary}</span>}
        </div>
      )}
    </div>
  );
};

// --- MODAL / DIALOG ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'xl',
}) => {
  if (!isOpen) return null;

  const widthMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-[2px] animate-fadeIn overflow-y-auto">
      <div
        className={cn(
          'bg-white rounded-2xl shadow-[0_24px_48px_-12px_rgb(15_23_42/0.25)] border border-slate-200/80 w-full overflow-hidden my-8',
          widthMap[maxWidth]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// --- INPUT ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, helperText, className, id, ...props }) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1">
          {label} {props.required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-[0_1px_2px_rgb(15_23_42/0.04)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors text-slate-900 placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500',
          error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};

// --- SELECT ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export const Select: React.FC<SelectProps> = ({ label, options, error, className, id, ...props }) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-700 mb-1">
          {label} {props.required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-[0_1px_2px_rgb(15_23_42/0.04)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors text-slate-900 disabled:bg-slate-50',
          error && 'border-red-500',
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

// --- TOAST CONTAINER ---
export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotification();

  if (toasts.length === 0) return null;

  const iconMap: Record<ToastType, ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-600 shrink-0" />,
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-lg animate-slideUp"
        >
          {iconMap[toast.type]}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-slate-900">{toast.title}</h4>
            {toast.message && <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
