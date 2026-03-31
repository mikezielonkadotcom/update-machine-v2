/**
 * Validates required environment variables on first request.
 * Throws immediately if any are missing so the app fails loudly
 * at startup instead of crashing on first use.
 *
 * Skipped during build (NEXT_PHASE=phase-production-build) and test.
 */

const required = [
  'DATABASE_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'ADMIN_TOKEN',
] as const;

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildPhase && process.env.NODE_ENV !== 'test') {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Check .env.local or your Vercel environment settings.'
    );
  }
}
