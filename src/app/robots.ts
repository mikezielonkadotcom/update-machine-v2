import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.NEXT_PUBLIC_BASE_URL === 'https://updatemachine.com';

  if (isProduction) {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/logmein'],
      },
      sitemap: 'https://updatemachine.com/sitemap.xml',
    };
  }

  // Block everything on non-production (canary, preview deploys)
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
