'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error') || '';
  const tokenParam = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const [magicEmail, setMagicEmail] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicError, setMagicError] = useState('');
  const [magicSuccess, setMagicSuccess] = useState('');

  // If we have a token param, redirect to verify
  if (tokenParam) {
    if (typeof window !== 'undefined') {
      window.location.href = `/api/auth/verify-magic-link?token=${tokenParam}`;
    }
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#e0e0e0' }}>Verifying...</div>;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data?.requires_2fa && data?.temp_token) {
          setTempToken(data.temp_token);
          setRequires2FA(true);
          setTwoFactorCode('');
          setLoading(false);
          return;
        }
        window.location.href = '/admin/sites';
      } else {
        setError(data?.error || 'Invalid email or password');
        setLoading(false);
      }
    } catch {
      setError('Network error. Try again.');
      setLoading(false);
    }
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempToken || !twoFactorCode) return;
    setTwoFactorLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code: twoFactorCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = '/admin/sites';
      } else {
        setError(data?.error || 'Invalid 2FA code');
        setTwoFactorLoading(false);
      }
    } catch {
      setError('Network error. Try again.');
      setTwoFactorLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicEmail) return;
    setMagicLoading(true);
    setMagicError('');
    setMagicSuccess('');
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: magicEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setMagicSuccess(data.message || 'Check your Slack for a login link.');
      } else {
        setMagicError(data.error || 'Something went wrong.');
        setMagicLoading(false);
      }
    } catch {
      setMagicError('Network error. Try again.');
      setMagicLoading(false);
    }
  };

  const errorBanner = errorParam === 'expired'
    ? 'This login link has expired or is invalid. Please request a new one.'
    : errorParam === 'invalid'
    ? 'Invalid login link. Please request a new one.'
    : errorParam === 'server'
    ? 'Server error. Please try again later.'
    : '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#0a0a0a', color: '#e0e0e0' }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: '2.5rem', width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Update Machine</h1>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Admin access</p>

        {errorBanner && (
          <p style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '0.75rem', borderRadius: 8, fontSize: '0.85rem', marginBottom: '1rem' }}>{errorBanner}</p>
        )}

        {!requires2FA ? (
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" autoComplete="email" autoFocus required
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #333', borderRadius: 8, background: '#0a0a0a', color: '#e0e0e0', fontSize: '1rem', marginBottom: '0.75rem', outline: 'none' }} />
            <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #333', borderRadius: 8, background: '#0a0a0a', color: '#e0e0e0', fontSize: '1rem', marginBottom: '0.75rem', outline: 'none' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#888', margin: '0.5rem 0', cursor: 'pointer', justifyContent: 'flex-start' }}>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ accentColor: '#f59e0b' }} /> Remember me for 30 days
            </label>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, marginTop: '0.5rem' }}>
              {loading ? 'Logging in...' : 'Log In'}
            </button>
            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}
          </form>
        ) : (
          <form onSubmit={handleTwoFactor}>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.75rem', textAlign: 'left' }}>
              Enter your {useRecoveryCode ? 'recovery code' : '6-digit authenticator code'}.
            </p>
            <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>
              {useRecoveryCode ? 'Recovery code' : '2FA code'}
            </label>
            <input
              type="text"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder={useRecoveryCode ? 'ABCD-EF12' : '123456'}
              autoComplete="one-time-code"
              autoFocus
              required
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #333', borderRadius: 8, background: '#0a0a0a', color: '#e0e0e0', fontSize: '1rem', marginBottom: '0.75rem', outline: 'none', letterSpacing: useRecoveryCode ? '0.06em' : '0.2em' }}
            />
            <button
              type="submit"
              disabled={twoFactorLoading}
              style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: twoFactorLoading ? 'not-allowed' : 'pointer', opacity: twoFactorLoading ? 0.5 : 1, marginTop: '0.5rem' }}
            >
              {twoFactorLoading ? 'Verifying...' : 'Verify 2FA'}
            </button>
            <button
              type="button"
              onClick={() => { setUseRecoveryCode((prev) => !prev); setTwoFactorCode(''); }}
              style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              {useRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTempToken('');
                setTwoFactorCode('');
                setUseRecoveryCode(false);
                setTwoFactorLoading(false);
                setError('');
              }}
              style={{ marginTop: '0.5rem', display: 'block', width: '100%', background: 'none', border: '1px solid #333', borderRadius: 8, color: '#aaa', padding: '0.55rem', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              Back to password login
            </button>
            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}
          </form>
        )}

        {!requires2FA && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0', color: '#555', fontSize: '0.8rem' }}>
            <div style={{ flex: 1, borderTop: '1px solid #2a2a2a' }} />
            <span>or</span>
            <div style={{ flex: 1, borderTop: '1px solid #2a2a2a' }} />
          </div>
        )}

        {!requires2FA && (
          <form onSubmit={handleMagicLink}>
            <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Email</label>
            <input type="email" value={magicEmail} onChange={e => setMagicEmail(e.target.value)} placeholder="admin@example.com" autoComplete="email" required
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #333', borderRadius: 8, background: '#0a0a0a', color: '#e0e0e0', fontSize: '1rem', marginBottom: '0.75rem', outline: 'none' }} />
            <button type="submit" disabled={magicLoading}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #333', borderRadius: 8, background: 'transparent', color: '#e0e0e0', fontSize: '1rem', fontWeight: 600, cursor: magicLoading ? 'not-allowed' : 'pointer', opacity: magicLoading ? 0.5 : 1, marginTop: '0.5rem' }}>
              {magicLoading ? (magicSuccess ? 'Link sent!' : 'Sending...') : 'Send me a login link'}
            </button>
            {magicError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{magicError}</p>}
            {magicSuccess && <p style={{ color: '#22c55e', fontSize: '0.85rem', marginTop: '0.75rem' }}>{magicSuccess}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
      <LoginForm />
    </Suspense>
  );
}
