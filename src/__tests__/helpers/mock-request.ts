import { NextRequest } from 'next/server';

export type MockRequestOptions = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  invalidJson?: boolean;
};

export function makeMockNextRequest(options: MockRequestOptions = {}): NextRequest {
  const headers = new Headers(options.headers || {});

  return {
    url: options.url || 'http://localhost:3000/api/test',
    method: options.method || 'POST',
    headers,
    json: async () => {
      if (options.invalidJson) throw new Error('Invalid JSON');
      return options.body;
    },
  } as NextRequest;
}
