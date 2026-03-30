const limiters = new Map<string, Map<string, { start: number; count: number }>>();

function getLimiter(name: string): Map<string, { start: number; count: number }> {
  if (!limiters.has(name)) {
    limiters.set(name, new Map());
  }
  return limiters.get(name)!;
}

export function rateLimit(
  limiterName: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const limiter = getLimiter(limiterName);
  const now = Date.now();
  let entry = limiter.get(key);

  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    limiter.set(key, entry);
  }
  entry.count++;

  // Probabilistic cleanup
  if (Math.random() < 0.01) {
    for (const [k, v] of limiter) {
      if (now - v.start > windowMs * 2) limiter.delete(k);
    }
  }

  return entry.count > maxAttempts;
}
