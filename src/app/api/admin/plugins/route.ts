import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin } from '@/lib/auth';
import { listObjects, getObject } from '@/lib/r2';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

  const objects = await listObjects();
  const updateJsonKeys = objects.filter(o => o.key.endsWith('/update.json'));

  const plugins: any[] = [];
  for (const obj of updateJsonKeys) {
    const slug = obj.key.split('/')[0];
    try {
      const file = await getObject(obj.key);
      if (file && file.body) {
        const chunks: Buffer[] = [];
        for await (const chunk of file.body as any) {
          chunks.push(Buffer.from(chunk));
        }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        plugins.push({
          slug, name: data.name || slug, version: data.version || 'unknown',
          download_url: data.download_url || '', last_updated: data.last_updated || '',
          tested: data.tested || '', requires: data.requires || '', requires_php: data.requires_php || '',
        });
      }
    } catch {
      plugins.push({ slug, name: slug, version: 'error reading manifest' });
    }
  }

  return NextResponse.json({ plugins, count: plugins.length }, { headers });
}
