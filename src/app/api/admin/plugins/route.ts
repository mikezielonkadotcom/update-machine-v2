import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { listObjects, getObject } from '@/lib/r2';
import { logError } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
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
    } catch (e: any) {
      logError({ source: 'admin', message: e.message });
      plugins.push({ slug, name: slug, version: 'error reading manifest' });
    }
  }

  return NextResponse.json({ plugins, count: plugins.length }, { headers });
});
