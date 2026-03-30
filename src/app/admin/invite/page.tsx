'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

function InviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [invite, setInvite] = useState<{ valid: boolean; email?: string; role?: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetch(`/api/admin/invite?token=${token}`).then(r => r.json()).then(setInvite);
    }
  }, [token]);

  if (!invite) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#e0e0e0' }}>Loading...</div>;
  }

  if (!invite.valid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#0a0a0a', color: '#e0e0e0' }}>
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: '2.5rem', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Update Machine</h1>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>This invite link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, display_name: displayName, password }),
      });
      if (res.ok) {
        window.location.href = '/logmein';
      } else {
        const data = await res.json();
        setError(data.error || 'Failed');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '0.75rem 1rem', border: '1px solid #333', borderRadius: 8, background: '#0a0a0a', color: '#e0e0e0', fontSize: '1rem', marginBottom: '0.75rem', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#0a0a0a', color: '#e0e0e0' }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: '2.5rem', width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Update Machine</h1>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          You&apos;ve been invited as: <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{invite.role}</span>
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Display Name</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" required style={inputStyle} />
          <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required style={inputStyle} />
          <label style={{ display: 'block', textAlign: 'left', fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" required style={inputStyle} />
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, marginTop: '0.5rem' }}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
          {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
      <InviteForm />
    </Suspense>
  );
}
