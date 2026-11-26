import React, {useState, useEffect} from 'react';
import {Plus, ArrowRight} from 'lucide-react';

const empty = {id: '', title: '', slug: '', excerpt: '', body: '', coverImage: '', tags: '', status: 'Draft'};

export default function BlogAdmin() {
  const [posts, setPosts] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => fetch('/api/blog').then(r => r.json()).then((d: any) => setPosts(d.posts || [])).catch(() => setError('Could not load posts'));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { action: 'save', id: form.id || undefined, title: form.title, slug: form.slug, excerpt: form.excerpt, body: form.body, coverImage: form.coverImage, tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean), status: form.status };
      const res = await fetch('/api/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d: any = await res.json();
      if (!res.ok) throw Error(d.error);
      setNotice(form.status === 'Published' ? 'Post published' : 'Draft saved');
      setForm(null); load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setBusy(true);
    try { const res = await fetch('/api/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) }); const d: any = await res.json(); if (!res.ok) throw Error(d.error); load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (form) return <div className="page-heading">
    <div><p className="eyebrow">BLOG</p><h1>{form.id ? 'Edit post' : 'New post'}</h1></div>
    <section className="panel" style={{ width: '100%', marginTop: 16 }}>
      {error && <p className="muted" style={{ color: '#b04545' }}>{error}</p>}
      <div className="form-grid">
        <label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: form.slug || e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })} /></label>
        <label>Slug<input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></label>
        <label className="full">Excerpt<textarea rows={2} value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} /></label>
        <label className="full">Body<textarea rows={14} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Separate paragraphs with a blank line." /></label>
        <label>Cover image URL (https, optional)<input value={form.coverImage} onChange={e => setForm({ ...form, coverImage: e.target.value })} /></label>
        <label>Tags (comma separated)<input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>Draft</option><option>Published</option></select></label>
      </div>
      <div className="button-row" style={{ marginTop: 16 }}>
        <button className="primary" disabled={busy} onClick={save}>{form.status === 'Published' ? 'Publish' : 'Save draft'}</button>
        <button disabled={busy} onClick={() => setForm(null)}>Cancel</button>
      </div>
    </section>
  </div>;

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">MARKETING</p><h1>Blog</h1><p>Write posts for authors and readers. Published posts appear at /blog and in the sitemap.</p></div>
      <button className="primary" onClick={() => setForm({ ...empty })}><Plus size={17} />New post</button>
    </div>
    {notice && <p className="muted">{notice}</p>}
    {error && <p className="muted" style={{ color: '#b04545' }}>{error}</p>}
    <section className="panel">
      {posts === null ? <p className="muted">Loading…</p> : !posts.length ? <p className="muted">No posts yet.</p> : <div className="table-wrap"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
        {posts.map(p => <tr key={p.id}>
          <td><strong>{p.title}</strong><small>/blog/{p.slug}</small></td>
          <td><span className={'badge ' + (p.status === 'Published' ? 'success' : '')}>{p.status}</span></td>
          <td>{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-IN') : '—'}</td>
          <td><div className="row-actions">
            <button onClick={() => setForm({ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt || '', body: p.body || '', coverImage: p.coverImage || '', tags: (p.tags || []).join(', '), status: p.status })}>Edit</button>
            {p.status === 'Published' && <a className="table-action-link" href={'/blog/' + p.slug} target="_blank" rel="noreferrer">View<ArrowRight size={14} /></a>}
            <button onClick={() => remove(p.id)}>Delete</button>
          </div></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
