import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex } from '@/lib/crypto';
import { queryOne } from '@/lib/db';
import { adminCorsHeaders } from '@/lib/helpers';

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const headers = adminCorsHeaders(origin);
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  let invite: any = null;
  if (token) {
    const tokenHash = await sha256Hex(token);
    invite = await queryOne(
      "SELECT * FROM invites WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()",
      [tokenHash]
    );
  }

  // Return JSON with invite info (the frontend page will handle rendering)
  if (!invite) {
    return NextResponse.json({ valid: false }, { headers });
  }

  return NextResponse.json({ valid: true, email: invite.email, role: invite.role }, { headers });
}
