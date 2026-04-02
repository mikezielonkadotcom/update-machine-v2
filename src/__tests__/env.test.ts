import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const requiredVars = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  R2_ENDPOINT: 'https://dummy.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'dummy-key',
  R2_SECRET_ACCESS_KEY: 'dummy-secret',
  R2_BUCKET_NAME: 'dummy-bucket',
  ADMIN_TOKEN: 'dummy-admin-token',
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('env validation', () => {
  it('does not warn when all required and optional vars are present', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      ...requiredVars,
      SESSION_SECRET: 'session-secret',
      TOTP_ENCRYPTION_KEY: 'totp-secret',
      CRON_SECRET: 'cron-secret',
      NODE_ENV: 'production',
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(import('../lib/env')).resolves.toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns for missing optional vars but does not throw', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      ...requiredVars,
      NODE_ENV: 'production',
    };
    delete process.env.SESSION_SECRET;
    delete process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.CRON_SECRET;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(import('../lib/env')).resolves.toBeDefined();
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('throws when required vars are missing', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
    };
    delete process.env.DATABASE_URL;
    delete process.env.R2_ENDPOINT;

    await expect(import('../lib/env')).rejects.toThrow('Missing required environment variables');
  });
});
