import { beforeEach, describe, expect, it } from 'vitest';
import { adminCorsHeaders } from '../lib/helpers';

describe('adminCorsHeaders', () => {
  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
  });

  it('allows only matching configured origins', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://admin.example.com';
    process.env.ALLOWED_ORIGINS = 'https://dashboard.example.com,https://ops.example.com';

    const allowed = adminCorsHeaders('https://dashboard.example.com');
    const blocked = adminCorsHeaders('https://evil.example.com');

    expect(allowed['Access-Control-Allow-Origin']).toBe('https://dashboard.example.com');
    expect(blocked['Access-Control-Allow-Origin']).toBe('null');
  });

  it('returns null for non-matching origin in production', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://admin.example.com';

    const headers = adminCorsHeaders('https://not-allowed.example.com');

    expect(headers['Access-Control-Allow-Origin']).toBe('null');
  });

  it('reflects request origin in development when no origins configured', () => {
    process.env.NODE_ENV = 'development';

    const headers = adminCorsHeaders('http://localhost:3000');

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });

  it('returns null in production when no origins are configured', () => {
    process.env.NODE_ENV = 'production';

    const headers = adminCorsHeaders('http://localhost:3000');

    expect(headers['Access-Control-Allow-Origin']).toBe('null');
  });

  it('always sets Vary Origin header', () => {
    const headers = adminCorsHeaders('https://example.com');

    expect(headers.Vary).toBe('Origin');
  });

  it('normalizes origins to protocol + host + port by stripping path', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com/some/path';

    const headers = adminCorsHeaders('https://app.example.com/another/path');

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });
});
