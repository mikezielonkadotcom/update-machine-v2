'use client';

import { useState, useEffect, useCallback } from 'react';

// Inline styles matching original dark theme
const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.5; min-height: 100vh; }
  .header { padding: 1.5rem 2rem 0; max-width: 1400px; margin: 0 auto; }
  .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
  .brand h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .user-info { display: flex; align-items: center; gap: 0.75rem; }
  .user-name { font-size: 0.85rem; color: #ccc; }
  .logout-btn { font-size: 0.8rem; color: #666; background: none; border: 1px solid #333; padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer; }
  .logout-btn:hover { color: #ccc; border-color: #555; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
  .stat-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 1rem 1.25rem; }
  .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .stat-label { font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.15rem; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid #1e1e1e; overflow-x: auto; }
  .tab { padding: 0.65rem 1.25rem; cursor: pointer; color: #666; border-bottom: 2px solid transparent; font-size: 0.85rem; font-weight: 500; white-space: nowrap; user-select: none; background: none; border-top: none; border-left: none; border-right: none; }
  .tab:hover { color: #aaa; }
  .tab.active { color: #f59e0b; border-bottom-color: #f59e0b; }
  .content { max-width: 1400px; margin: 0 auto; padding: 0 2rem 2rem; }
  .panel { display: none; padding-top: 1.5rem; }
  .panel.active { display: block; }
  .card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; }
  .card h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 1rem; color: #ccc; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid #1a1a1a; font-size: 0.82rem; white-space: nowrap; }
  th { color: #555; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.06em; position: sticky; top: 0; background: #141414; }
  tr:hover td { background: #1a1a1a; }
  tr.inactive td { opacity: 0.4; }
  a { color: #f59e0b; text-decoration: none; }
  a:hover { color: #fbbf24; text-decoration: underline; }
  code { background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.82em; color: #ccc; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
  .badge-active { background: rgba(34,197,94,0.15); color: #22c55e; }
  .badge-revoked { background: rgba(239,68,68,0.15); color: #ef4444; }
  .badge-owner { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .badge-viewer { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .badge-warn { background: rgba(234,179,8,0.15); color: #eab308; }
  .badge-info { background: rgba(59,130,246,0.15); color: #3b82f6; }
  .empty { padding: 3rem; text-align: center; color: #444; font-size: 0.9rem; }
  .form-row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
  .form-row label { font-size: 0.78rem; color: #888; }
  input, select { background: #0a0a0a; border: 1px solid #2a2a2a; color: #e0e0e0; padding: 0.45rem 0.7rem; border-radius: 6px; font-size: 0.82rem; }
  input:focus, select:focus { border-color: #f59e0b; outline: none; }
  input[type="checkbox"] { accent-color: #f59e0b; }
  .btn { background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; border: none; padding: 0.5rem 1.1rem; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .btn:hover { opacity: 0.85; }
  .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.72rem; background: #222; color: #999; border: 1px solid #333; border-radius: 5px; cursor: pointer; }
  .btn-sm:hover { background: #2a2a2a; color: #ccc; border-color: #444; }
  .btn-danger { background: #dc2626; color: #fff; border: none; }
  .btn-danger:hover { background: #ef4444; }
  .result { margin-top: 0.75rem; padding: 0.75rem 1rem; background: #0f1a12; border: 1px solid #1a3a1f; border-radius: 6px; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; font-size: 0.82rem; word-break: break-all; color: #22c55e; }
  .plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.75rem; }
  .plugin-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 1.25rem; }
  .plugin-card:hover { border-color: #333; }
  .plugin-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
  .plugin-card-header h4 { font-size: 0.95rem; font-weight: 600; }
  .plugin-version { background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700; font-size: 0.85rem; }
  .plugin-card-meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.78rem; color: #666; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; align-items: center; justify-content: center; }
  .modal-overlay.active { display: flex; }
  .modal { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 2rem; width: 100%; max-width: 440px; }
  .modal h3 { margin-bottom: 1rem; color: #e0e0e0; }
  .modal .form-group { margin-bottom: 0.75rem; }
  .modal .form-group label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 0.3rem; }
  .modal .form-group input, .modal .form-group select { width: 100%; }
  .modal-actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; justify-content: flex-end; }
  .btn-secondary { background: #333; color: #ccc; border: none; padding: 0.5rem 1.1rem; border-radius: 6px; cursor: pointer; font-size: 0.82rem; }
  .pagination { display: flex; gap: 0.5rem; align-items: center; margin-top: 1rem; justify-content: center; }
  .pagination span { font-size: 0.82rem; color: #888; }
  @media (max-width: 768px) {
    .header { padding: 1rem 1rem 0; }
    .content { padding: 0 1rem 1.5rem; }
    .stats { grid-template-columns: repeat(2, 1fr); }
    .stat-value { font-size: 1.3rem; }
    .form-row { flex-direction: column; align-items: stretch; }
    .plugin-grid { grid-template-columns: 1fr; }
  }
`;

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

const roleBadge: Record<string, string> = { owner: 'badge-owner', admin: 'badge-active', viewer: 'badge-viewer' };

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('sites');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [stats, setStats] = useState({ sites: 0, plugins: 0, activeKeys: 0, groups: 0, blocked: 0, errors: 0, downloads: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form states
  const [gName, setGName] = useState('');
  const [gSlug, setGSlug] = useState('');
  const [gAuth, setGAuth] = useState('auto');
  const [gRequireKey, setGRequireKey] = useState(false);
  const [kGroup, setKGroup] = useState('1');
  const [kUrl, setKUrl] = useState('');
  const [kLocked, setKLocked] = useState(true);
  const [keyResult, setKeyResult] = useState('');
  const [bUrl, setBUrl] = useState('');
  const [bReason, setBReason] = useState('');
  const [inviteModal, setInviteModal] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('admin');
  const [inviteResult, setInviteResult] = useState('');

  // Tab data states
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any>({ total: 0, per_plugin: [], per_version: [], recent: [] });
  const [dlPlugin, setDlPlugin] = useState('');
  const [dlDays, setDlDays] = useState('');
  const [activity, setActivity] = useState<any>({ entries: [], total: 0, page: 1, per_page: 50 });
  const [activityPage, setActivityPage] = useState(1);
  const [activityAction, setActivityAction] = useState('');
  const [errors, setErrors] = useState<any>({ entries: [], total: 0, page: 1, per_page: 50 });
  const [errorsPage, setErrorsPage] = useState(1);
  const [errorsLevel, setErrorsLevel] = useState('');
  const [errorsSource, setErrorsSource] = useState('');

  // Profile
  const [pName, setPName] = useState('');
  const [pCurrent, setPCurrent] = useState('');
  const [pNew, setPNew] = useState('');
  const [pConfirm, setPConfirm] = useState('');
  const [profileResult, setProfileResult] = useState('');

  const headers = { 'Content-Type': 'application/json' };
  const isWriter = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const isOwner = currentUser?.role === 'owner';

  const loadDashboard = useCallback(async () => {
    try {
      const [sitesRes, pluginsRes, groupsRes, keysRes, blockRes, errDigest, dlRes] = await Promise.all([
        fetch('/api/admin/sites').then(r => r.json()),
        fetch('/api/admin/plugins').then(r => r.json()),
        fetch('/api/admin/groups').then(r => r.json()),
        fetch('/api/admin/keys').then(r => r.json()),
        fetch('/api/admin/blocklist').then(r => r.json()),
        fetch('/api/admin/errors/digest').then(r => r.json()).catch(() => ({ total_errors: 0 })),
        fetch('/api/admin/downloads').then(r => r.json()).catch(() => ({ total: 0 })),
      ]);
      setSites(sitesRes.sites || []);
      setPlugins(pluginsRes.plugins || []);
      setGroups(groupsRes.groups || []);
      setKeys(keysRes.keys || []);
      setBlocked(blockRes.blocked || []);
      const activeKeys = (keysRes.keys || []).filter((k: any) => k.is_active).length;
      setStats({
        sites: (sitesRes.sites || []).length,
        plugins: (pluginsRes.plugins || []).length,
        activeKeys,
        groups: (groupsRes.groups || []).length,
        blocked: (blockRes.blocked || []).length,
        errors: errDigest.total_errors || 0,
        downloads: dlRes.total || 0,
      });
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load dashboard data');
    }
  }, []);

  useEffect(() => {
    // Load current user profile and dashboard data
    fetch('/api/admin/profile').then(r => {
      if (!r.ok) { window.location.href = '/logmein'; return null; }
      return r.json();
    }).then(data => {
      if (data) {
        setCurrentUser(data);
        loadDashboard();
      }
    }).catch(() => { window.location.href = '/logmein'; });
  }, [loadDashboard]);

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', headers });
    window.location.href = '/logmein';
  };

  // Tab change handlers
  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'downloads') loadDownloads();
    if (activeTab === 'security') loadSessions();
    if (activeTab === 'activity') loadActivity();
    if (activeTab === 'errors') loadErrors();
  }, [activeTab]);

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    setUsers(data.users || []);
    setInvites(data.invites || []);
  };

  const loadSessions = async () => {
    const res = await fetch('/api/admin/sessions');
    const data = await res.json();
    setSessions(data.sessions || []);
  };

  const loadDownloads = async () => {
    let url = '/api/admin/downloads?';
    if (dlPlugin) url += 'plugin=' + encodeURIComponent(dlPlugin) + '&';
    if (dlDays) url += 'days=' + dlDays;
    const res = await fetch(url);
    const data = await res.json();
    setDownloads(data);
  };

  const loadActivity = async () => {
    let url = `/api/admin/activity?page=${activityPage}&per_page=50`;
    if (activityAction) url += '&action=' + encodeURIComponent(activityAction);
    const res = await fetch(url);
    const data = await res.json();
    setActivity(data);
  };

  const loadErrors = async () => {
    let url = `/api/admin/errors?page=${errorsPage}&per_page=50`;
    if (errorsLevel) url += '&level=' + encodeURIComponent(errorsLevel);
    if (errorsSource) url += '&source=' + encodeURIComponent(errorsSource);
    const res = await fetch(url);
    const data = await res.json();
    setErrors(data);
  };

  // Actions
  const createGroup = async () => {
    const res = await fetch('/api/admin/groups', {
      method: 'POST', headers,
      body: JSON.stringify({ name: gName, slug: gSlug, auth_mode: gAuth, require_key: gRequireKey }),
    });
    if (res.ok) { loadDashboard(); setGName(''); setGSlug(''); }
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm('Delete this group?')) return;
    const res = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE', headers });
    if (res.ok) loadDashboard();
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const generateKey = async () => {
    const res = await fetch('/api/admin/keys', {
      method: 'POST', headers,
      body: JSON.stringify({ group_id: parseInt(kGroup), site_url: kUrl, domain_locked: kLocked }),
    });
    const data = await res.json();
    if (res.ok) { setKeyResult(data.site_key); setTimeout(() => loadDashboard(), 2000); }
    else alert('Error: ' + data.error);
  };

  const revokeKey = async (id: number) => {
    if (!confirm('Revoke this key?')) return;
    const res = await fetch(`/api/admin/keys/${id}`, { method: 'DELETE', headers });
    if (res.ok) loadDashboard();
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const blockSite = async () => {
    if (!bUrl) return alert('URL required');
    const res = await fetch('/api/admin/blocklist', {
      method: 'POST', headers,
      body: JSON.stringify({ site_url: bUrl, reason: bReason }),
    });
    if (res.ok) { loadDashboard(); setBUrl(''); setBReason(''); }
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const unblock = async (url: string) => {
    if (!confirm('Unblock ' + url + '?')) return;
    const res = await fetch(`/api/admin/blocklist/${encodeURIComponent(url)}`, { method: 'DELETE', headers });
    if (res.ok) loadDashboard();
  };

  const inviteUser = async () => {
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers,
      body: JSON.stringify({ email: invEmail, role: invRole }),
    });
    const data = await res.json();
    if (res.ok) { setInviteResult(data.invite_url); }
    else alert('Error: ' + data.error);
  };

  const changeRole = async (id: number, role: string) => {
    if (!role || !confirm('Change this user role to ' + role + '?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'PUT', headers, body: JSON.stringify({ role }) });
    if (res.ok) loadUsers();
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const removeUser = async (id: number) => {
    if (!confirm('Remove this user? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    if (res.ok) loadUsers();
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const transferOwnership = async (id: number, name: string) => {
    if (!confirm('Transfer ownership to ' + name + '? You will be demoted to admin.')) return;
    const res = await fetch('/api/admin/users/transfer-ownership', { method: 'POST', headers, body: JSON.stringify({ user_id: id }) });
    if (res.ok) { alert('Ownership transferred. You will be logged out.'); logout(); }
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const clearOldErrors = async () => {
    if (!confirm('Delete error log entries older than 30 days?')) return;
    const res = await fetch('/api/admin/errors/cleanup', { method: 'DELETE', headers });
    if (res.ok) { const data = await res.json(); alert('Deleted ' + data.deleted + ' entries'); loadErrors(); }
    else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const saveProfile = async () => {
    if (!pCurrent) return alert('Current password is required');
    if (pNew && pNew !== pConfirm) return alert('New passwords do not match');
    if (pNew && pNew.length < 8) return alert('Password must be at least 8 characters');

    const body: any = { current_password: pCurrent };
    if (pNew) body.new_password = pNew;
    if (pName) body.display_name = pName;

    const res = await fetch('/api/admin/profile', { method: 'PUT', headers, body: JSON.stringify(body) });
    if (res.ok) {
      setProfileResult('Profile updated successfully');
      setPCurrent(''); setPNew(''); setPConfirm('');
    } else { const d = await res.json(); alert('Error: ' + d.error); }
  };

  const tabList = ['sites', 'plugins', 'groups', 'keys', 'blocklist', 'users', 'downloads', 'activity', 'errors', 'security', 'profile'];

  const levelBadge: Record<string, string> = { error: 'badge-revoked', warn: 'badge-warn', info: 'badge-info' };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="header">
        <div className="header-top">
          <div className="brand"><h1>Update Machine</h1></div>
          <div className="user-info">
            <span className="user-name">{currentUser?.display_name || ''}</span>
            {currentUser?.role && <span className={`badge ${roleBadge[currentUser.role] || ''}`}>{currentUser.role}</span>}
            <button className="logout-btn" onClick={logout}>Log out</button>
          </div>
        </div>
        <div className="stats">
          {[
            { value: stats.sites, label: 'Sites' },
            { value: stats.plugins, label: 'Plugins' },
            { value: stats.activeKeys, label: 'Active Keys' },
            { value: stats.groups, label: 'Groups' },
            { value: stats.blocked, label: 'Blocked' },
            { value: stats.errors, label: 'Errors (24h)' },
            { value: stats.downloads, label: 'Downloads' },
          ].map(s => (
            <div className="stat-card" key={s.label}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="tabs">
          {tabList.map(t => (
            <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="content">
        {loadError && (
          <div className="card" style={{ borderColor: '#dc2626', marginBottom: '1rem' }}>
            <span className="badge badge-revoked">Error</span>{' '}
            <span style={{ fontSize: '0.85rem' }}>{loadError}</span>
            <button className="btn-sm" style={{ marginLeft: '1rem' }} onClick={() => { setLoadError(null); loadDashboard(); }}>Retry</button>
          </div>
        )}
        {/* Sites Tab */}
        <div className={`panel ${activeTab === 'sites' ? 'active' : ''}`}>
          {sites.length === 0 ? <p className="empty">No sites tracked yet.</p> : (
            <div className="card"><div className="table-wrap"><table>
              <thead><tr><th>Site</th><th>URL</th><th>Email</th><th>Plugin</th><th>Version</th><th>Last Seen</th><th>Checks</th></tr></thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={i}>
                    <td>{s.site_name}</td>
                    <td><a href={s.site_url} target="_blank" rel="noopener noreferrer">{s.site_url}</a></td>
                    <td>{s.admin_email}</td>
                    <td>{s.plugin_slug}</td>
                    <td>{s.plugin_version}</td>
                    <td>{s.last_seen}</td>
                    <td>{s.check_count}</td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
          )}
        </div>

        {/* Plugins Tab */}
        <div className={`panel ${activeTab === 'plugins' ? 'active' : ''}`}>
          {plugins.length === 0 ? <p className="empty">No plugins found.</p> : (
            <div className="plugin-grid">
              {plugins.map((p, i) => (
                <div className="plugin-card" key={i}>
                  <div className="plugin-card-header">
                    <h4>{p.name}</h4>
                    <span className="plugin-version">v{p.version}</span>
                  </div>
                  <div className="plugin-card-meta">
                    <span>Slug: <code>{p.slug}</code></span>
                    {p.last_updated && <span>Updated: {p.last_updated}</span>}
                    {p.requires && <span>WP: {p.requires}+</span>}
                    {p.requires_php && <span>PHP: {p.requires_php}+</span>}
                    {p.tested && <span>Tested: {p.tested}</span>}
                  </div>
                  {p.download_url && <div style={{ marginTop: '0.75rem' }}><a href={p.download_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem' }}>Download ZIP</a></div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Groups Tab */}
        <div className={`panel ${activeTab === 'groups' ? 'active' : ''}`}>
          {isWriter && (
            <div className="card"><h3>Create Group</h3>
              <div className="form-row">
                <label>Name</label><input value={gName} onChange={e => setGName(e.target.value)} placeholder="My Group" />
                <label>Slug</label><input value={gSlug} onChange={e => setGSlug(e.target.value)} placeholder="my-group" />
                <label>Auth</label>
                <select value={gAuth} onChange={e => setGAuth(e.target.value)}><option value="auto">auto</option><option value="license-key">license-key</option><option value="both">both</option></select>
                <label><input type="checkbox" checked={gRequireKey} onChange={e => setGRequireKey(e.target.checked)} /> Require Key</label>
                <button className="btn" onClick={createGroup}>Create</button>
              </div>
            </div>
          )}
          <div className="card"><div className="table-wrap"><table>
            <thead><tr><th>ID</th><th>Name</th><th>Slug</th><th>Auth Mode</th><th>Require Key</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id}>
                  <td>{g.id}</td><td>{g.name}</td><td><code>{g.slug}</code></td><td>{g.auth_mode}</td>
                  <td>{g.require_key ? 'Yes' : 'No'}</td><td>{g.created_at}</td>
                  <td>{isWriter && g.slug !== 'default' && <button className="btn-sm btn-danger" onClick={() => deleteGroup(g.id)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </div>

        {/* Keys Tab */}
        <div className={`panel ${activeTab === 'keys' ? 'active' : ''}`}>
          {isWriter && (
            <div className="card"><h3>Generate License Key</h3>
              <div className="form-row">
                <label>Group ID</label><input value={kGroup} onChange={e => setKGroup(e.target.value)} type="number" style={{ width: '4rem' }} />
                <label>Site URL</label><input value={kUrl} onChange={e => setKUrl(e.target.value)} placeholder="https://example.com (optional)" />
                <label><input type="checkbox" checked={kLocked} onChange={e => setKLocked(e.target.checked)} /> Domain Locked</label>
                <button className="btn" onClick={generateKey}>Generate</button>
              </div>
              {keyResult && <div className="result">{keyResult}</div>}
            </div>
          )}
          <div className="card"><div className="table-wrap"><table>
            <thead><tr><th>ID</th><th>Site URL</th><th>Group</th><th>Type</th><th>Locked</th><th>Status</th><th>Last Used</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className={k.is_active ? '' : 'inactive'}>
                  <td>{k.id}</td><td>{k.site_url || <em>any</em>}</td><td>{k.group_name || 'default'}</td>
                  <td>{k.key_type}</td><td>{k.domain_locked ? 'Yes' : 'No'}</td>
                  <td>{k.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-revoked">Revoked</span>}</td>
                  <td>{k.last_used || 'Never'}</td><td>{k.created_at}</td>
                  <td>{isWriter && k.is_active && <button className="btn-sm btn-danger" onClick={() => revokeKey(k.id)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </div>

        {/* Blocklist Tab */}
        <div className={`panel ${activeTab === 'blocklist' ? 'active' : ''}`}>
          {isWriter && (
            <div className="card"><h3>Block Domain</h3>
              <div className="form-row">
                <label>Site URL</label><input value={bUrl} onChange={e => setBUrl(e.target.value)} placeholder="https://pirate-site.com" />
                <label>Reason</label><input value={bReason} onChange={e => setBReason(e.target.value)} placeholder="Optional reason" />
                <button className="btn btn-danger" onClick={blockSite}>Block</button>
              </div>
            </div>
          )}
          {blocked.length === 0 ? <p className="empty">No blocked domains.</p> : (
            <div className="card"><div className="table-wrap"><table>
              <thead><tr><th>Site URL</th><th>Reason</th><th>Blocked At</th><th></th></tr></thead>
              <tbody>
                {blocked.map(b => (
                  <tr key={b.id}>
                    <td>{b.site_url}</td><td>{b.reason}</td><td>{b.created_at}</td>
                    <td>{isWriter && <button className="btn-sm" onClick={() => unblock(b.site_url)}>Unblock</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
          )}
        </div>

        {/* Users Tab */}
        <div className={`panel ${activeTab === 'users' ? 'active' : ''}`}>
          {isWriter && (
            <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
              <button className="btn" onClick={() => setInviteModal(true)}>Invite User</button>
            </div>
          )}
          <div className="card"><h3>Users</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.display_name}</td><td>{u.email}</td>
                    <td><span className={`badge ${roleBadge[u.role] || ''}`}>{u.role}</span></td>
                    <td>{u.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-revoked">Inactive</span>}</td>
                    <td>{u.created_at}</td>
                    <td>
                      {isOwner && u.id !== currentUser?.id && u.role !== 'owner' && (
                        <select onChange={e => changeRole(u.id, e.target.value)} style={{ fontSize: '0.75rem', padding: '0.2rem' }} defaultValue="">
                          <option value="">{u.role}</option>
                          {u.role !== 'admin' && <option value="admin">admin</option>}
                          {u.role !== 'viewer' && <option value="viewer">viewer</option>}
                        </select>
                      )}{' '}
                      {isOwner && u.role === 'admin' && (
                        <button className="btn-sm" onClick={() => transferOwnership(u.id, u.display_name)}>Transfer</button>
                      )}{' '}
                      {isWriter && u.id !== currentUser?.id && u.role !== 'owner' && (isOwner || u.role === 'viewer') && (
                        <button className="btn-sm btn-danger" onClick={() => removeUser(u.id)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
          <div className="card"><h3>Pending Invites</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Email</th><th>Role</th><th>Invited By</th><th>Expires</th></tr></thead>
              <tbody>
                {invites.length === 0 ? <tr><td colSpan={4} className="empty">No pending invites</td></tr> :
                  invites.map(i => (
                    <tr key={i.id}><td>{i.email}</td><td><span className="badge">{i.role}</span></td><td>{i.invited_by_email || ''}</td><td>{i.expires_at}</td></tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>
        </div>

        {/* Downloads Tab */}
        <div className={`panel ${activeTab === 'downloads' ? 'active' : ''}`}>
          <div className="card">
            <h3>Download Analytics</h3>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <label>Plugin</label>
              <select value={dlPlugin} onChange={e => { setDlPlugin(e.target.value); setTimeout(loadDownloads, 0); }}>
                <option value="">All plugins</option>
                {(downloads.per_plugin || []).map((p: any) => <option key={p.plugin_slug} value={p.plugin_slug}>{p.plugin_slug}</option>)}
              </select>
              <label>Days</label>
              <select value={dlDays} onChange={e => { setDlDays(e.target.value); setTimeout(loadDownloads, 0); }}>
                <option value="">All time</option>
                <option value="1">Last 24h</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
              </select>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="stat-value">{downloads.total || 0}</div>
              <div className="stat-label">Total Downloads</div>
            </div>
            <h3>Per Plugin</h3>
            <div className="table-wrap" style={{ marginBottom: '1.5rem' }}><table>
              <thead><tr><th>Plugin</th><th>Downloads</th><th>Versions</th></tr></thead>
              <tbody>
                {(downloads.per_plugin || []).length === 0 ? <tr><td colSpan={3} className="empty">No downloads yet</td></tr> :
                  (downloads.per_plugin || []).map((p: any) => {
                    const versions = (downloads.per_version || []).filter((v: any) => v.plugin_slug === p.plugin_slug).map((v: any) => `${v.plugin_version} (${v.downloads})`).join(', ');
                    return <tr key={p.plugin_slug}><td><code>{p.plugin_slug}</code></td><td>{p.downloads}</td><td>{versions}</td></tr>;
                  })
                }
              </tbody>
            </table></div>
            <h3>Recent Downloads</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Time</th><th>Plugin</th><th>Version</th><th>Site</th><th>IP</th></tr></thead>
              <tbody>
                {(downloads.recent || []).length === 0 ? <tr><td colSpan={5} className="empty">No downloads yet</td></tr> :
                  (downloads.recent || []).map((d: any, i: number) => (
                    <tr key={i}><td>{timeAgo(d.created_at)}</td><td><code>{d.plugin_slug}</code></td><td>{d.plugin_version}</td><td>{d.site_url || ''}</td><td>{d.site_ip || ''}</td></tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>
        </div>

        {/* Activity Tab */}
        <div className={`panel ${activeTab === 'activity' ? 'active' : ''}`}>
          <div className="card">
            <h3>Activity Log</h3>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <label>Filter</label>
              <select value={activityAction} onChange={e => { setActivityAction(e.target.value); setActivityPage(1); setTimeout(loadActivity, 0); }}>
                <option value="">All actions</option>
                {['user.login','user.logout','user.invite','user.accept_invite','user.role_change','user.remove','group.create','group.delete','key.create','key.revoke','blocklist.add','blocklist.remove'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Description</th><th>IP</th></tr></thead>
              <tbody>
                {(activity.entries || []).length === 0 ? <tr><td colSpan={5} className="empty">No activity</td></tr> :
                  (activity.entries || []).map((e: any, i: number) => (
                    <tr key={i}><td>{timeAgo(e.created_at)}</td><td>{e.user_email}</td><td><code>{e.action}</code></td><td>{e.description}</td><td>{e.ip_address || ''}</td></tr>
                  ))
                }
              </tbody>
            </table></div>
            <div className="pagination">
              <button className="btn-sm" onClick={() => { if (activityPage > 1) { setActivityPage(p => p - 1); setTimeout(loadActivity, 0); } }}>Prev</button>
              <span>Page {activity.page || 1} of {Math.ceil((activity.total || 0) / (activity.per_page || 50)) || 1}</span>
              <button className="btn-sm" onClick={() => { setActivityPage(p => p + 1); setTimeout(loadActivity, 0); }}>Next</button>
            </div>
          </div>
        </div>

        {/* Errors Tab */}
        <div className={`panel ${activeTab === 'errors' ? 'active' : ''}`}>
          <div className="card">
            <h3>Error Log</h3>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <label>Level</label>
              <select value={errorsLevel} onChange={e => { setErrorsLevel(e.target.value); setErrorsPage(1); setTimeout(loadErrors, 0); }}>
                <option value="">All levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option>
              </select>
              <label>Source</label>
              <select value={errorsSource} onChange={e => { setErrorsSource(e.target.value); setErrorsPage(1); setTimeout(loadErrors, 0); }}>
                <option value="">All sources</option>
                {['fetch','register','analytics','admin','r2','auth'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {isOwner && <button className="btn-sm btn-danger" onClick={clearOldErrors}>Clear old errors</button>}
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Path</th><th>Message</th><th>IP</th></tr></thead>
              <tbody>
                {(errors.entries || []).length === 0 ? <tr><td colSpan={6} className="empty">No errors</td></tr> :
                  (errors.entries || []).map((e: any, i: number) => (
                    <tr key={i}><td>{timeAgo(e.created_at)}</td><td><span className={`badge ${levelBadge[e.level] || ''}`}>{e.level}</span></td><td>{e.source}</td><td>{e.request_path || ''}</td><td>{e.message}</td><td>{e.request_ip || ''}</td></tr>
                  ))
                }
              </tbody>
            </table></div>
            <div className="pagination">
              <button className="btn-sm" onClick={() => { if (errorsPage > 1) { setErrorsPage(p => p - 1); setTimeout(loadErrors, 0); } }}>Prev</button>
              <span>Page {errors.page || 1} of {Math.ceil((errors.total || 0) / (errors.per_page || 50)) || 1}</span>
              <button className="btn-sm" onClick={() => { setErrorsPage(p => p + 1); setTimeout(loadErrors, 0); }}>Next</button>
            </div>
          </div>
        </div>

        {/* Security Tab */}
        <div className={`panel ${activeTab === 'security' ? 'active' : ''}`}>
          <div className="card">
            <h3>Two-Factor Authentication</h3>
            <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.75rem' }}>
              Manage authenticator app setup, recovery codes, and disable flow from the Security settings page.
            </p>
            <a href="/admin/security">Open Security Settings</a>
          </div>
          <div className="card">
            <h3>Active Sessions</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>User</th><th>Email</th><th>Created</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {sessions.length === 0 ? <tr><td colSpan={5} className="empty">No active sessions</td></tr> :
                  sessions.map((s, i) => (
                    <tr key={i}><td>{s.display_name}</td><td>{s.email}</td><td>{timeAgo(s.created_at)}</td><td>{new Date(s.expires_at).toLocaleString()}</td><td><span className="badge badge-active">Active</span></td></tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>
        </div>

        {/* Profile Tab */}
        <div className={`panel ${activeTab === 'profile' ? 'active' : ''}`}>
          <div className="card" style={{ maxWidth: 500 }}>
            <h3>Profile</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: '0.3rem' }}>Display Name</label>
              <input value={pName} onChange={e => setPName(e.target.value)} style={{ width: '100%' }} />
            </div>
            <h3>Change Password</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: '0.3rem' }}>Current Password</label>
              <input type="password" value={pCurrent} onChange={e => setPCurrent(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: '0.3rem' }}>New Password</label>
              <input type="password" value={pNew} onChange={e => setPNew(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: '0.3rem' }}>Confirm New Password</label>
              <input type="password" value={pConfirm} onChange={e => setPConfirm(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button className="btn" onClick={saveProfile}>Save Changes</button>
            {profileResult && <div className="result">{profileResult}</div>}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      <div className={`modal-overlay ${inviteModal ? 'active' : ''}`}>
        <div className="modal">
          <h3>Invite User</h3>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="user@example.com" style={{ width: '100%' }} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={invRole} onChange={e => setInvRole(e.target.value)} style={{ width: '100%' }}><option value="admin">Admin</option><option value="viewer">Viewer</option></select>
          </div>
          {inviteResult && <div className="result">{inviteResult}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => { setInviteModal(false); setInviteResult(''); }}>Cancel</button>
            <button className="btn" onClick={inviteUser}>Send Invite</button>
          </div>
        </div>
      </div>
    </>
  );
}
