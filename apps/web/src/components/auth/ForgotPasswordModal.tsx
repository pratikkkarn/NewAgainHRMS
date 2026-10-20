import React, { useState } from 'react';
import { Modal, Input, Button } from '../common/UIComponents';
import { CheckCircle2, KeyRound, Link2 } from 'lucide-react';
import { useAccess } from '../../context/AccessContext';
import { linkWithParam, RESET_VALID_MINUTES } from '../../lib/passwordDemo';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const { requestPasswordReset, mode } = useAccess();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  const close = () => {
    setSubmitted(false);
    setEmail('');
    setError('');
    setDemoLink(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid Prime Star email address');
      return;
    }
    try {
      const { resetToken } = await requestPasswordReset(email);
      setDemoLink(resetToken ? linkWithParam('reset', resetToken) : null);
      setSubmitted(true);
    } catch (failure) {
      // Only a problem reaching the server or too many tries; an unknown email looks like success.
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Reset Your Password"
      subtitle="Enter your work email address to receive password recovery instructions."
      maxWidth="md"
    >
      {!submitted ? (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <Input
            label="Work Email Address *"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            placeholder="yourname@primestar.com"
            error={error}
            required
          />

          <p className="text-slate-500 text-[11px] leading-relaxed">
            If an active Prime Star HRMS account exists for this email, a reset link valid for {RESET_VALID_MINUTES}{' '}
            minutes will be sent to your inbox.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<KeyRound className="w-3.5 h-3.5" />}>
              Send Reset Link
            </Button>
          </div>
        </form>
      ) : (
        <div className="py-4 text-center space-y-4 text-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Check your inbox</h4>
            <p className="text-slate-600 mt-1 max-w-sm mx-auto leading-relaxed">
              If <strong>{email}</strong> belongs to an active account, a reset link is on its way.
            </p>
          </div>

          {/* No email is sent yet, so the link is shown here instead. */}
          {demoLink && (
            <div className="text-left p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
              <span className="font-semibold text-amber-800 flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" /> {mode === 'api' ? 'Testing: the email would contain this link' : 'Demo mode: the email would contain this link'}
              </span>
              <a href={demoLink} className="block font-mono text-[10px] text-blue-700 underline break-all">
                {demoLink}
              </a>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={close} className="mt-2">
            Return to Sign In
          </Button>
        </div>
      )}
    </Modal>
  );
};
