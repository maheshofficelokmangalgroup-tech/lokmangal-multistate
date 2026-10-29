import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight, KeyRound, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const LoginScreen: React.FC = () => {
  const { login, verify2FA, requires2FA } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState('admin@lokmangalmultistate.com');
  const [password, setPassword] = useState('Lokmangal@2026Secure!');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await login(email, password);
      if (res.requires2FA) {
        addToast({
          type: 'info',
          title: '2FA Verification Required',
          message: 'Please enter the 6-digit code from your Authenticator app.',
        });
      } else if (!res.success) {
        addToast({
          type: 'error',
          title: 'Authentication Failed',
          message: res.error || 'Invalid credentials.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await verify2FA(totpCode);
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Signed in successfully',
          message: 'Welcome back to Lokmangal Admin Workspace.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Invalid Code',
          message: res.error || 'The 6-digit code was incorrect or expired.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-center items-center bg-canvas p-4 sm:p-6">
      <div className="w-full max-w-md bg-surface rounded-panel shadow-2xl border border-border p-6 sm:p-8">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-control bg-brand-primary text-white flex items-center justify-center font-bold text-lg shadow-sm">
            LM
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-text-primary">
            Lokmangal Multistate
          </h1>
          <p className="mt-1 text-xs text-text-secondary uppercase tracking-wider font-semibold">
            Staff & Administration Workspace
          </p>
        </div>

        {!requires2FA ? (
          /* Step 1: Email and Password */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                Staff Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@lokmangalmultistate.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-canvas border border-border rounded-control focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">
                  Password
                </label>
                <span className="text-xs text-brand-primary hover:underline cursor-pointer">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-canvas border border-border rounded-control focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-control bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              <span>{isLoading ? 'Verifying...' : 'Sign In with Password'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* Step 2: 2FA TOTP Challenge */
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="p-3 bg-brand-soft rounded-control border border-brand/20 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
              <div className="text-xs text-text-primary">
                <p className="font-bold">Two-Factor Authentication</p>
                <p className="text-text-secondary mt-0.5">
                  Enter the 6-digit verification code from Google or Microsoft Authenticator.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                6-Digit Security Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2.5 text-center text-lg tracking-widest font-mono font-bold bg-canvas border border-border rounded-control focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full py-2.5 px-4 rounded-control bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Verify & Enter Workspace'}</span>
              <ShieldCheck className="w-4 h-4" />
            </button>

            {/* Demo quick fill button */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setTotpCode('123456')}
                className="text-xs text-brand-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fill sample 2FA code (123456)</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-border text-center text-[11px] text-text-secondary">
          <p>Protected by Argon2id, Session Encryption & Role-Based Access Control.</p>
          <p className="mt-1">Lokmangal Multistate Co-operative Society Ltd. © 2026</p>
        </div>
      </div>
    </div>
  );
};
