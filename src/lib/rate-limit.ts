import { query, queryOne } from './db';

/**
 * Postgres-backed rate limiter for serverless environments.
 *
 * In-memory rate limiting doesn't work on Vercel because each invocation
 * may run in a different isolate with no shared state. This uses a
 * `rate_limits` table to track attempts across all instances.
 *
 * Uses INSERT ... ON CONFLICT with a window-based approach:
 * - Each (limiter, key) pair tracks a count and window start time.
 * - If the window has expired, the count resets.
 * - Returns true if the rate limit is exceeded.
 */
export async function rateLimit(
  limiterName: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<boolean> {
  try {
    const windowSeconds = Math.ceil(windowMs / 1000);

    // Atomically upsert: reset window if expired, otherwise increment
    const result = await queryOne<{ attempt_count: number }>(
      `INSERT INTO rate_limits (limiter, key, attempt_count, window_start)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (limiter, key) DO UPDATE SET
         attempt_count = CASE
           WHEN rate_limits.window_start < NOW() - INTERVAL '1 second' * $3
           THEN 1
           ELSE rate_limits.attempt_count + 1
         END,
         window_start = CASE
           WHEN rate_limits.window_start < NOW() - INTERVAL '1 second' * $3
           THEN NOW()
           ELSE rate_limits.window_start
         END
       RETURNING attempt_count`,
      [limiterName, key, windowSeconds]
    );

    // Probabilistic cleanup of expired entries (1% chance per call)
    if (Math.random() < 0.01) {
      query(
        `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 second' * $1 * 2`,
        [windowSeconds]
      ).catch(() => {});
    }

    return (result?.attempt_count ?? 0) > maxAttempts;
  } catch {
    // If the rate_limits table doesn't exist yet or DB is down,
    // fail open to avoid blocking legitimate traffic
    return false;
  }
}
