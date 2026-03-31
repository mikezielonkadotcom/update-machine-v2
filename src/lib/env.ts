/**
 * Validates required environment variables at import time.
 * Throws immediately if any are missing so the app fails loudly
 * at startup instead of crashing on first use.
 */

const required = [
  'DATABASE_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'ADMIN_TOKEN',
] as const;

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
    'Check .env.local or your Vercel environment settings.'
  );
}
