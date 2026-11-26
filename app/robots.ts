import type {MetadataRoute} from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/workspace', '/admin', '/api', '/account', '/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/staff-login', '/checkout', '/cart', '/order-received', '/purchases'] },
    ],
    sitemap: 'https://openshelfpress.com/sitemap.xml',
    host: 'https://openshelfpress.com',
  };
}
