'use client';

import { useEffect, useMemo, useState } from 'react';

type TwoFAStatus = {
  enabled: boolean;
  verified_at: string | null;
};

type SetupResponse = {
  secret: string;
  qr_code: string;
  manual_entry_key: string;
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a0a0a',
  color: '#e0e0e0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: '2rem 1rem',
};

const cardStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  background: '#141414',
  border: '1px solid #1e1e1e',
  borderRadius: 12,
  padding: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  color: '#e0e0e0',
  padding: '0.7rem 0.8rem',
  fontSize: '0.95rem',
};

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 600,
  padding: '0.65rem 1rem',
  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: 8,
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 500,
  padding: '0.65rem 1rem',
  background: 'transparent',
};

export default function SecurityPage() {
  const [status, setStatus] = useState<TwoFAStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);

  const verifiedAt = useMemo(() => {
    if (!status?.verified_at) return null;
    return new Date(status.verified_at).toLocaleString();
  }, [status]);

  const loadStatus = async () => {
    setLoadingStatus(true);
    setError('');

    try {
      const res = await fetch('/api/admin/2fa/status');
      if (res.status === 401) {
        window.location.href = '/logmein';
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to load 2FA status');
      } else {
        setStatus({ enabled: !!data.enabled, verified_at: data.verified_at || null });
      }
    } catch {
      setError('Network error while loading status');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const startSetup = async () => {
    setLoadingAction(true);
    setMessage('');
    setError('');
    setRecoveryCodes([]);

    try {
      const res = await fetch('/api/admin/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to start 2FA setup');
      } else {
        setSetupData(data);
        setMessage('Scan the QR code with your authenticator app, then verify with a code.');
      }
    } catch {
      setError('Network error while starting setup');
    } finally {
      setLoadingAction(false);
    }
  };

  const verifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode) return;

    setLoadingAction(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch('/api/admin/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Verification failed');
      } else {
        setRecoveryCodes(Array.isArray(data.recovery_codes) ? data.recovery_codes : []);
        setVerifyCode('');
        setSetupData(null);
        setMessage('2FA enabled. Save your recovery codes now, they are shown only once.');
        await loadStatus();
      }
    } catch {
      setError('Network error while verifying 2FA');
    } finally {
      setLoadingAction(false);
    }
  };

  const disableTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode) return;

    setLoadingAction(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch('/api/admin/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Disable failed');
      } else {
        setDisablePassword('');
        setDisableCode('');
        setSetupData(null);
        setRecoveryCodes([]);
        setMessage('2FA disabled successfully.');
        await loadStatus();
      }
    } catch {
      setError('Network error while disabling 2FA');
    } finally {
      setLoadingAction(false);
    }
  };

  const copyRecoveryCodes = async () => {
    if (recoveryCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setMessage('Recovery codes copied to clipboard.');
    } catch {
      setError('Failed to copy recovery codes.');
    }
  };

  const downloadRecoveryCodes = () => {
    if (recoveryCodes.length === 0) return;
    const blob = new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'update-machine-recovery-codes.txt';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (loadingStatus) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>Loading security settings...</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>Security</h1>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Two-factor authentication protects your admin account with a second verification step.
        </p>

        <div style={{ padding: '0.85rem', border: '1px solid #2a2a2a', borderRadius: 8, marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.86rem', color: '#999' }}>2FA Status</div>
          <div style={{ marginTop: '0.3rem', fontWeight: 600, color: status?.enabled ? '#22c55e' : '#f59e0b' }}>
            {status?.enabled ? 'Enabled' : 'Disabled'}
          </div>
          {verifiedAt && (
            <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#888' }}>
              Verified at: {verifiedAt}
            </div>
          )}
        </div>

        {!status?.enabled && !setupData && (
          <button style={primaryButtonStyle} disabled={loadingAction} onClick={startSetup}>
            {loadingAction ? 'Starting setup...' : 'Enable 2FA'}
          </button>
        )}

        {!status?.enabled && setupData && (
          <div style={{ marginTop: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Step 1: Scan QR code</h2>
            <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '1rem', background: '#fff', borderRadius: 10, display: 'inline-block' }}>
              <img src={setupData.qr_code} alt="2FA QR code" width={220} height={220} />
            </div>
            <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1rem' }}>
              Can&apos;t scan? Enter this key manually: <code>{setupData.manual_entry_key}</code>
            </p>

            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Step 2: Verify code</h2>
            <form onSubmit={verifySetup}>
              <input
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                required
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button type="submit" style={primaryButtonStyle} disabled={loadingAction}>
                  {loadingAction ? 'Verifying...' : 'Verify & Enable'}
                </button>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => {
                    setSetupData(null);
                    setVerifyCode('');
                    setError('');
                    setMessage('');
                  }}
                >
                  Cancel setup
                </button>
              </div>
            </form>
          </div>
        )}

        {status?.enabled && (
          <div style={{ marginTop: '1.2rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Disable 2FA</h2>
            <form onSubmit={disableTwoFactor}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: '#888' }}>Current password</label>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: '#888' }}>Authenticator or recovery code</label>
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="123456 or ABCD-EF12"
                required
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <button type="submit" style={secondaryButtonStyle} disabled={loadingAction}>
                {loadingAction ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </form>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div style={{ marginTop: '1.25rem', padding: '0.85rem', border: '1px solid #2a2a2a', borderRadius: 8 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Recovery Codes</h2>
            <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '0.7rem' }}>
              Save these in a secure place. Each code can be used once.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.4rem', marginBottom: '0.8rem' }}>
              {recoveryCodes.map((code) => (
                <code key={code} style={{ background: '#0a0a0a', border: '1px solid #252525', borderRadius: 6, padding: '0.4rem 0.45rem', fontSize: '0.88rem' }}>
                  {code}
                </code>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button onClick={copyRecoveryCodes} style={secondaryButtonStyle}>Copy recovery codes</button>
              <button onClick={downloadRecoveryCodes} style={secondaryButtonStyle}>Download TXT</button>
            </div>
          </div>
        )}

        {message && <p style={{ marginTop: '1rem', color: '#22c55e', fontSize: '0.86rem' }}>{message}</p>}
        {error && <p style={{ marginTop: '1rem', color: '#ef4444', fontSize: '0.86rem' }}>{error}</p>}
      </div>
    </div>
  );
}
