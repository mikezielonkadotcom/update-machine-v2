import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from './helpers';
import { verifyAdmin, AuthUser, getClientIp } from './auth';
import { logError } from './logging';
import './env';

type AdminHandlerFn = (
  request: NextRequest,
  user: AuthUser,
  ctx: { origin: string; headers: Record<string, string>; ip: string }
) => Promise<NextResponse>;

/**
 * Wraps an admin route handler with the standard boilerplate:
 * 1. CORS headers from allowlisted origins
 * 2. bootstrapOwner() (cached after first success)
 * 3. Session/token auth via verifyAdmin()
 * 4. Structured error logging on unhandled exceptions
 *
 * Usage:
 *   export const GET = adminHandler(async (request, user, { headers }) => {
 *     return NextResponse.json({ data }, { headers });
 *   });
 */
export function adminHandler(fn: AdminHandlerFn) {
  return async (request: NextRequest, _routeCtx?: any) => {
    const origin = new URL(request.url).origin;
    const headers = adminCorsHeaders(origin);

    try {
      await bootstrapOwner();
    } catch (e: any) {
      logError({ source: 'bootstrap', message: `bootstrapOwner failed: ${e.message}`, stack: e.stack });
    }

    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const ip = getClientIp(request);

    try {
      return await fn(request, user, { origin, headers, ip });
    } catch (e: any) {
      const contentType = request.headers.get('content-type') || '';
      if (e instanceof SyntaxError && contentType.includes('application/json')) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
      }

      logError({
        source: 'admin',
        message: e.message || 'Unhandled admin route error',
        stack: e.stack,
        request_method: request.method,
        request_path: new URL(request.url).pathname,
        request_ip: ip,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
    }
  };
}

/** Standard OPTIONS handler for admin routes */
export function adminOptions(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}
