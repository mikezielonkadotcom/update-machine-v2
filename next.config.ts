import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // v1 compatibility: um-updater.php POSTs to /register (no /api prefix).
      // Deployed plugins already have this URL baked in, so rewrite to the
      // actual Next.js route without requiring a client-side change.
      {
        source: '/register',
        destination: '/api/register',
      },
    ];
  },
};

export default nextConfig;
