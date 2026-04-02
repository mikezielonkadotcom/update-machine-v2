'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from './error-boundary';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname.startsWith('/admin/invite');

  return (
    <ErrorBoundary>
      {!hideNav && (
        <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1e1e1e', padding: '0.75rem 1rem' }}>
          <nav style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: '0.6rem' }}>
            <Link
              href="/admin/sites"
              style={{
                color: pathname.startsWith('/admin/sites') ? '#f59e0b' : '#ccc',
                textDecoration: 'none',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                padding: '0.45rem 0.7rem',
                fontSize: '0.85rem',
              }}
            >
              Sites
            </Link>
            <Link
              href="/admin/security"
              style={{
                color: pathname.startsWith('/admin/security') ? '#f59e0b' : '#ccc',
                textDecoration: 'none',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                padding: '0.45rem 0.7rem',
                fontSize: '0.85rem',
              }}
            >
              Security
            </Link>
          </nav>
        </div>
      )}
      {children}
    </ErrorBoundary>
  );
}
