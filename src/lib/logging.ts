import { query } from './db';
import { AuthUser } from './auth';

export async function logActivity(
  user: AuthUser | null,
  action: string,
  description: string,
  entityType?: string,
  entityId?: string,
  ip?: string
): Promise<void> {
  try {
    await query(
      'INSERT INTO activity_log (user_id, user_email, action, description, entity_type, entity_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        user?.id || null,
        user?.email || 'system',
        action,
        description,
        entityType || null,
        entityId || null,
        ip || null,
      ]
    );
  } catch {
    // Logging must never throw
  }
}

export function logError(opts: {
  level?: string;
  source: string;
  message: string;
  stack?: string;
  request_method?: string;
  request_path?: string;
  request_ip?: string;
  user_agent?: string;
  extra?: any;
}): void {
  try {
    const extraJson = opts.extra ? JSON.stringify(opts.extra) : null;
    query(
      'INSERT INTO error_log (level, source, message, stack, request_method, request_path, request_ip, user_agent, extra) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        opts.level || 'error',
        opts.source,
        opts.message,
        opts.stack || null,
        opts.request_method || null,
        opts.request_path || null,
        opts.request_ip || null,
        opts.user_agent || null,
        extraJson,
      ]
    ).catch(() => {});
  } catch {
    // Logging must never throw
  }
}

export function logWarn(opts: Omit<Parameters<typeof logError>[0], 'level'>): void {
  logError({ ...opts, level: 'warn' });
}

export function logInfo(opts: Omit<Parameters<typeof logError>[0], 'level'>): void {
  logError({ ...opts, level: 'info' });
}
