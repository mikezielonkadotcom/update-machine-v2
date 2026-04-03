import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ role: 'owner' }));

vi.mock('@/lib/admin-handler', async () => {
  const { NextResponse } = await import('next/server');

  return {
    adminHandler: (fn: any) => async (request: any) => fn(
      request,
      {
        id: 1,
        email: 'admin@example.com',
        display_name: 'Admin',
        role: authState.role,
        via: 'session',
      },
      {
        origin: 'http://localhost:3000',
        headers: { 'Access-Control-Allow-Origin': '*' },
        ip: '127.0.0.1',
      }
    ),
    adminOptions: () => new NextResponse(null, { status: 204 }),
  };
});

vi.mock('@/lib/r2', () => ({
  listObjects: vi.fn(async () => []),
  getObjectAsBuffer: vi.fn(async () => null),
  putObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logging', () => ({
  logActivity: vi.fn(async () => undefined),
  logError: vi.fn(),
}));

import { DELETE, POST } from '@/app/api/admin/plugins/route';
import { deleteObject, putObject } from '@/lib/r2';

function makeFormRequest(formData: FormData) {
  return {
    formData: async () => formData,
  } as any;
}

function makeJsonRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe('admin plugin upload/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'owner';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://updates.example.com';
  });

  it('upload missing fields returns 400', async () => {
    const response = await POST(makeFormRequest(new FormData()));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'slug, name, version, and file are required' });
  });

  it('upload invalid slug returns 400', async () => {
    const form = new FormData();
    form.set('slug', 'My Plugin');
    form.set('name', 'My Plugin');
    form.set('version', '1.2.3');
    form.set('file', new File([new Uint8Array([1])], 'my-plugin.zip', { type: 'application/zip' }));

    const response = await POST(makeFormRequest(form));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid slug format' });
  });

  it('successful upload calls putObject twice', async () => {
    const form = new FormData();
    form.set('slug', 'my-plugin');
    form.set('name', 'My Plugin');
    form.set('version', '1.2.3');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'my-plugin-1.2.3.zip', { type: 'application/zip' }));

    const response = await POST(makeFormRequest(form));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(putObject).toHaveBeenCalledTimes(2);
    expect(putObject).toHaveBeenNthCalledWith(
      1,
      'my-plugin/my-plugin-1.2.3.zip',
      expect.any(Buffer),
      'application/zip'
    );
    expect(putObject).toHaveBeenNthCalledWith(
      2,
      'my-plugin/update.json',
      expect.any(Buffer),
      'application/json'
    );
  });

  it('delete missing slug returns 400', async () => {
    const response = await DELETE(makeJsonRequest({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'slug is required' });
  });

  it('successful delete calls deleteObject', async () => {
    authState.role = 'owner';

    const response = await DELETE(makeJsonRequest({ slug: 'my-plugin', version: '1.2.3' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, deleted: 'my-plugin' });
    expect(deleteObject).toHaveBeenCalledWith('my-plugin/my-plugin-1.2.3.zip');
  });
});
