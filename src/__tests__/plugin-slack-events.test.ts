import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-handler', async () => {
  const { NextResponse } = await import('next/server');

  return {
    adminHandler: (fn: any) => async (request: any) => fn(
      request,
      {
        id: 1,
        email: 'admin@example.com',
        display_name: 'Admin',
        role: 'owner',
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

vi.mock('@/lib/slack', () => ({
  sendSlackMessage: vi.fn(async () => undefined),
}));

import { DELETE, POST } from '@/app/api/admin/plugins/route';
import { sendSlackMessage } from '@/lib/slack';

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

describe('plugin Slack notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = 'https://updates.example.com';
  });

  it('sends Slack notification on plugin upload', async () => {
    const form = new FormData();
    form.set('slug', 'my-plugin');
    form.set('name', 'My Plugin');
    form.set('version', '1.2.3');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'my-plugin-1.2.3.zip', { type: 'application/zip' }));

    const response = await POST(makeFormRequest(form));

    expect(response.status).toBe(200);
    expect(vi.mocked(sendSlackMessage)).toHaveBeenCalledWith('Plugin uploaded: my-plugin v1.2.3 by admin@example.com');
  });

  it('sends Slack notification on plugin delete', async () => {
    const response = await DELETE(makeJsonRequest({ slug: 'my-plugin', version: '1.2.3' }));

    expect(response.status).toBe(200);
    expect(vi.mocked(sendSlackMessage)).toHaveBeenCalledWith('Plugin deleted: my-plugin v1.2.3 by admin@example.com');
  });
});
