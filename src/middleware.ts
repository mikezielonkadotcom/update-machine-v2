import { NextRequest, NextResponse } from 'next/server';

/**
 * Defense-in-depth middleware for admin routes.
 * Ensures every /api/admin/* request has either a valid session cookie
 * or a Bearer token before the route handler runs. This prevents new
 * admin routes from accidentally skipping auth.
 *
 * Note: Full session/HMAC verification still happens in verifyAdmin()
 * inside each route handler. This middleware is a fast gatekeeper that
 * rejects obviously unauthenticated requests early.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate /api/admin/* routes
  if (!pathname.startsWith('/api/admin')) {
    return NextResponse.next();
  }

  // Allow preflight CORS requests through
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  // Login endpoint must be accessible without auth
  if (pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  // Check for Bearer token
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.length > 7) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('um_session');
  if (sessionCookie?.value) {
    return NextResponse.next();
  }

  // No credentials — reject
  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  );
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
