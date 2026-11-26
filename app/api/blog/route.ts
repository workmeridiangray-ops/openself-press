import {user,staff,isStaff,db,create,change,record,audit,reply,origin} from '../../../lib/server';
export const dynamic='force-dynamic';
const text=(v:any,n=2000)=>String(v||'').trim().slice(0,n);
const slugify=(s:string)=>String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,100);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    let staffMode = false;
    try { const u = await user(); staffMode = isStaff(u); } catch {}
    if (slug) {
      const row = await db().prepare("SELECT * FROM records WHERE kind='Blog' AND json_extract(data,'$.slug')=?").bind(slug).first<any>();
      if (!row) return reply({ error: 'Post not found' }, 404);
      const d = JSON.parse(row.data);
      if (row.status !== 'Published' && !staffMode) return reply({ error: 'Post not found' }, 404);
      return reply({ post: { id: row.id, status: row.status, ...d } });
    }
    const rows = (await db().prepare("SELECT * FROM records WHERE kind='Blog' ORDER BY created DESC").all<any>()).results
      .map((r: any) => ({ id: r.id, status: r.status, ...JSON.parse(r.data) }))
      .filter((p: any) => staffMode || p.status === 'Published');
    return reply({ posts: rows });
  } catch (e: any) { return reply({ error: e.message || 'Unable to load posts' }, 400); }
}

export async function POST(req: Request) {
  try {
    origin(req);
    const u = await user();
    staff(u);
    const b: any = await req.json();
    if (b.action === 'save') {
      const title = text(b.title, 200);
      if (!title) throw Error('Enter a title');
      const body = text(b.body, 50000);
      if (!body) throw Error('Write the post body');
      let slug = slugify(b.slug || title);
      if (!slug) throw Error('Enter a valid slug');
      const existingBySlug = await db().prepare("SELECT id FROM records WHERE kind='Blog' AND json_extract(data,'$.slug')=? AND id!=?").bind(slug, b.id || '').first<any>();
      if (existingBySlug) throw Error('A post with this slug already exists');
      const status = ['Draft', 'Published'].includes(b.status) ? b.status : 'Draft';
      const data = {
        title, slug, excerpt: text(b.excerpt, 400), body,
        coverImage: /^https:\/\//.test(b.coverImage || '') ? b.coverImage : '',
        tags: Array.isArray(b.tags) ? b.tags.map((t: any) => text(t, 40)).filter(Boolean).slice(0, 8) : [],
        authorName: text(b.authorName, 100) || u.displayName || 'Open Shelf Press',
        publishedAt: status === 'Published' ? (b.id ? undefined : new Date().toISOString()) : undefined,
      };
      if (b.id) {
        const r = await record(b.id, u);
        if (r.kind !== 'Blog') throw Error('Invalid post');
        const next = { ...r.data, ...data, publishedAt: status === 'Published' ? (r.data.publishedAt || new Date().toISOString()) : r.data.publishedAt };
        await change(r, status, next);
        await audit(r.id, u.email, 'Blog post saved: ' + title);
        return reply({ ok: true, id: r.id });
      }
      const id = await create(u.userId, 'Blog', status, data);
      await audit(id, u.email, 'Blog post created: ' + title);
      return reply({ ok: true, id });
    }
    if (b.action === 'delete') {
      const r = await record(b.id, u);
      if (r.kind !== 'Blog') throw Error('Invalid post');
      await db().prepare('DELETE FROM records WHERE id=?').bind(r.id).run();
      await audit(r.id, u.email, 'Blog post deleted: ' + r.data.title);
      return reply({ ok: true });
    }
    throw Error('Unknown action');
  } catch (e: any) { return reply({ error: e.message || 'Unable to save post' }, 400); }
}
