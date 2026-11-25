import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
// Public, unauthenticated cover-image serving for the storefront — only for cover files whose
// linked book has actually been published, so nothing unapproved or unpublished is exposed.
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id') || '';
    const row = await env.DB!.prepare("SELECT * FROM records WHERE id=? AND kind='Cover design'").bind(id).first<any>();
    if (!row) return new Response('Not found', { status: 404 });
    const d = JSON.parse(row.data);
    if (row.status !== 'Approved' || !d.bookReference) return new Response('Not found', { status: 404 });
    const book = await env.DB!.prepare("SELECT status FROM records WHERE id=? AND kind='Publishing'").bind(d.bookReference).first<any>();
    if (!book || book.status !== 'Published') return new Response('Not found', { status: 404 });
    if (!/^image\/(png|jpeg)$/.test(d.fileType || '')) return new Response('Not found', { status: 404 });
    const obj = await env.BUCKET!.get(d.fileKey);
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': d.fileType, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
