import { describe, it, expect } from 'vitest';
import { GET } from '../app/api/health/route';

describe('GET /api/health', () => {
  it('returns status ok with timestamp', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it('sets CORS and robots headers', async () => {
    const response = await GET();
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
