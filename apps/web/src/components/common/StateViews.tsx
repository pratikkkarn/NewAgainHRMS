import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { Button } from './UIComponents';

// Shown when a page is opened without the permission it needs.
export const NoAccess: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="bg-white p-10 rounded-xl border border-slate-200/80 text-center text-xs space-y-3">
    <Lock className="w-8 h-8 text-slate-300 mx-auto" />
    <h2 className="text-sm font-bold text-slate-900">You don't have access to this page</h2>
    <p className="text-slate-500 max-w-sm mx-auto">
      Your role doesn't include the permission this page needs. Ask your admin if you think you should have it.
    </p>
    <Button variant="outline" size="sm" onClick={onBack}>
      Go to Dashboard
    </Button>
  </div>
);

// Consistent "nothing here yet" block for lists.
export const EmptyState: React.FC<{ title: string; message?: string; action?: ReactNode }> = ({
  title,
  message,
  action,
}) => (
  <div className="p-10 text-center text-xs space-y-2">
    <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
    <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
    {message && <p className="text-slate-500 max-w-sm mx-auto">{message}</p>}
    {action && <div className="pt-1">{action}</div>}
  </div>
);

interface ErrorBoundaryProps {
  resetKey: string; // changing it (e.g. switching page) clears the error
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Keeps one broken page from blanking the whole app.
export class PageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bg-white p-10 rounded-xl border border-red-200 text-center text-xs space-y-3">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <h2 className="text-sm font-bold text-slate-900">Something went wrong on this page</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          The rest of the app still works. Try again, or switch to another page.
        </p>
        <p className="font-mono text-[11px] text-red-600 break-words max-w-md mx-auto">{this.state.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
