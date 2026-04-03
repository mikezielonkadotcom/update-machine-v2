import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { deleteObject, getObjectAsBuffer, listObjects, putObject } from '@/lib/r2';
import { requireRole } from '@/lib/auth';
import { logActivity, logError } from '@/lib/logging';

export { adminOptions as OPTIONS };

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ZIP_KEY_REGEX = /^([^/]+)\/\1-(.+)\.zip$/;

type PluginSections = {
  changelog?: string;
  description?: string;
};

type PluginUpdateJson = {
  name: string;
  slug: string;
  version: string;
  download_url: string;
  tested?: string;
  requires?: string;
  requires_php?: string;
  last_updated: string;
  sections: PluginSections;
};

function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

function isValidVersion(version: string): boolean {
  return VERSION_REGEX.test(version);
}

function parseVersionParts(version: string): number[] | null {
  const base = version.trim().split('-')[0].split('+')[0];
  const parts = base.split('.');
  if (parts.length !== 3) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some(Number.isNaN)) return null;
  return numbers;
}

function compareVersionsDesc(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);

  if (!aParts || !bParts) {
    return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
  }

  for (let i = 0; i < 3; i += 1) {
    if (aParts[i] !== bParts[i]) {
      return bParts[i] - aParts[i];
    }
  }

  return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
}

function buildDownloadUrl(slug: string, version: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const path = `${slug}/${slug}-${version}.zip`;
  return baseUrl ? `${baseUrl}/${path}` : `/${path}`;
}

function listVersionsFromObjects(slug: string, objects: { key: string }[]): string[] {
  const prefix = `${slug}/`;
  return objects
    .filter((obj) => obj.key.startsWith(prefix) && obj.key.endsWith('.zip'))
    .map((obj) => {
      const match = obj.key.match(ZIP_KEY_REGEX);
      return match?.[1] === slug ? match[2] : null;
    })
    .filter((version): version is string => Boolean(version));
}

async function getUpdateJson(slug: string): Promise<PluginUpdateJson | null> {
  const raw = await getObjectAsBuffer(`${slug}/update.json`);
  if (!raw) return null;
  return JSON.parse(raw.toString('utf-8')) as PluginUpdateJson;
}

function toManifest(input: {
  name: string;
  slug: string;
  version: string;
  tested?: string;
  requires?: string;
  requiresPhp?: string;
  changelog?: string;
  description?: string;
}): PluginUpdateJson {
  return {
    name: input.name,
    slug: input.slug,
    version: input.version,
    download_url: buildDownloadUrl(input.slug, input.version),
    last_updated: new Date().toISOString(),
    ...(input.tested ? { tested: input.tested } : {}),
    ...(input.requires ? { requires: input.requires } : {}),
    ...(input.requiresPhp ? { requires_php: input.requiresPhp } : {}),
    sections: {
      ...(input.changelog ? { changelog: input.changelog } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
  };
}

export const GET = adminHandler(async (_request, _user, { headers }) => {
  const objects = await listObjects();
  const updateJsonKeys = objects.filter((obj) => obj.key.endsWith('/update.json'));

  const plugins: any[] = [];
  for (const obj of updateJsonKeys) {
    const slug = obj.key.split('/')[0];

    try {
      const file = await getObjectAsBuffer(obj.key);
      if (!file) continue;

      const data = JSON.parse(file.toString('utf-8')) as PluginUpdateJson;
      plugins.push({
        slug,
        name: data.name || slug,
        version: data.version || 'unknown',
        download_url: data.download_url || '',
        last_updated: data.last_updated || '',
        tested: data.tested || '',
        requires: data.requires || '',
        requires_php: data.requires_php || '',
      });
    } catch (e: any) {
      logError({ source: 'admin', message: e.message });
      plugins.push({ slug, name: slug, version: 'error reading manifest' });
    }
  }

  return NextResponse.json({ plugins, count: plugins.length }, { headers });
});

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  const formData = await request.formData();

  const slug = String(formData.get('slug') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const version = String(formData.get('version') || '').trim();
  const tested = String(formData.get('tested') || '').trim();
  const requires = String(formData.get('requires') || '').trim();
  const requiresPhp = String(formData.get('requires_php') || '').trim();
  const changelog = String(formData.get('changelog') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const file = formData.get('file');

  if (!slug || !name || !version || !(file instanceof File)) {
    return NextResponse.json({ error: 'slug, name, version, and file are required' }, { status: 400, headers });
  }

  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400, headers });
  }

  if (!isValidVersion(version)) {
    return NextResponse.json({ error: 'Invalid version format' }, { status: 400, headers });
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    return NextResponse.json({ error: 'file must be a .zip file' }, { status: 400, headers });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file exceeds 50MB limit' }, { status: 413, headers });
  }

  const zipKey = `${slug}/${slug}-${version}.zip`;
  const zipBuffer = Buffer.from(await file.arrayBuffer());
  await putObject(zipKey, zipBuffer, 'application/zip');

  const metadata = toManifest({
    name,
    slug,
    version,
    tested,
    requires,
    requiresPhp,
    changelog,
    description,
  });

  await putObject(
    `${slug}/update.json`,
    Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8'),
    'application/json'
  );

  await logActivity(
    user,
    'plugin.upload',
    `source=admin action=plugin.upload slug=${slug} version=${version}`,
    'plugin',
    slug,
    ip
  );

  return NextResponse.json({ ok: true, plugin: metadata }, { headers });
});

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  if (!requireRole(user, 'owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  const body = await request.json();
  const slug = String(body?.slug || '').trim();
  const version = body?.version ? String(body.version).trim() : '';

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400, headers });
  }

  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400, headers });
  }

  if (version && !isValidVersion(version)) {
    return NextResponse.json({ error: 'Invalid version format' }, { status: 400, headers });
  }

  const prefix = `${slug}/`;
  const objects = await listObjects(prefix);

  if (!version) {
    await Promise.all(objects.map((obj) => deleteObject(obj.key)));
    await logActivity(
      user,
      'plugin.delete',
      `source=admin action=plugin.delete slug=${slug}`,
      'plugin',
      slug,
      ip
    );
    return NextResponse.json({ ok: true, deleted: slug }, { headers });
  }

  const zipKey = `${slug}/${slug}-${version}.zip`;
  await deleteObject(zipKey);

  const refreshedObjects = await listObjects(prefix);
  const remainingVersions = listVersionsFromObjects(slug, refreshedObjects);

  if (remainingVersions.length === 0) {
    await deleteObject(`${slug}/update.json`);
  } else {
    const latestVersion = [...remainingVersions].sort(compareVersionsDesc)[0];
    const currentManifest = await getUpdateJson(slug);

    const manifest = toManifest({
      name: currentManifest?.name || slug,
      slug,
      version: latestVersion,
      tested: currentManifest?.tested,
      requires: currentManifest?.requires,
      requiresPhp: currentManifest?.requires_php,
      changelog: currentManifest?.sections?.changelog,
      description: currentManifest?.sections?.description,
    });

    await putObject(
      `${slug}/update.json`,
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
      'application/json'
    );
  }

  await logActivity(
    user,
    'plugin.delete',
    `source=admin action=plugin.delete slug=${slug} version=${version}`,
    'plugin',
    slug,
    ip
  );

  return NextResponse.json({ ok: true, deleted: slug }, { headers });
});
