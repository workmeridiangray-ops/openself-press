import type {MetadataRoute} from 'next';
import {db} from '../lib/server';

const SITE = 'https://openshelfpress.com';
const staticPaths = ['/', '/bookstore', '/free-publishing', '/publish', '/services', '/about', '/contact', '/calculator', '/plans', '/faq', '/blog', '/privacy', '/terms', '/shipping', '/returns'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = staticPaths.map(p => ({ url: SITE + p, lastModified: now, changeFrequency: p === '/' || p === '/bookstore' || p === '/blog' ? 'daily' : 'monthly', priority: p === '/' ? 1 : 0.6 }));
  try {
    const books = (await db().prepare("SELECT id,updated FROM records WHERE kind='Catalogue' AND status='Published'").all<any>()).results;
    for (const b of books) entries.push({ url: SITE + '/book/' + b.id, lastModified: new Date(b.updated), changeFrequency: 'weekly', priority: 0.7 });
  } catch {}
  try {
    const posts = (await db().prepare("SELECT data,updated FROM records WHERE kind='Blog' AND status='Published'").all<any>()).results;
    for (const p of posts) { try { const d = JSON.parse(p.data); if (d.slug) entries.push({ url: SITE + '/blog/' + d.slug, lastModified: new Date(p.updated), changeFrequency: 'monthly', priority: 0.5 }); } catch {} }
  } catch {}
  return entries;
}
