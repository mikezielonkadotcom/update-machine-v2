import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: { 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}
