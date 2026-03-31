'use client';

import { ErrorBoundary } from './error-boundary';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
