// Google fetches only a deliberately staged, immutable release. This never
// exposes the general manuscript bucket or publishes the public print catalogue.
export const GOOGLE_COLLECTION = 'A0HEG97';
export const GOOGLE_PREFIX = 'distribution/google-play/' + GOOGLE_COLLECTION + '/';
export type FeedEntry = { path: string; key: string; size: number; sha256: string; contentType: string };
export type FeedRelease = { collection: string; release: string; modified: string; files: FeedEntry[] };
type FeedEnv = { BUCKET?: R2Bucket; GOOGLE_BOOKS_FEED_MODE?: string; GOOGLE_BOOKS_FEED_USERNAME?: string; GOOGLE_BOOKS_FEED_PASSWORD?: string };
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function validFeedPath(path: string) {
  return new RegExp('^(?:onix/(?:validate|' + GOOGLE_COLLECTION + '-(?:full|rights))/[A-Za-z0-9_]+\\.xml|ebooks/' + GOOGLE_COLLECTION + '/[0-9]{13}(?:_interior\\.pdf|_frontcover\\.jpg|\\.epub))$').test(path);
}
export function validateRelease(value: unknown): FeedRelease {
  const r = value as FeedRelease;
  if (!r || r.collection !== GOOGLE_COLLECTION || !/^[A-Za-z0-9]{1,64}$/.test(r.release) || !/^\d{4}-\d\d-\d\dT/.test(r.modified) || !Number.isFinite(Date.parse(r.modified)) || !Array.isArray(r.files) || !r.files.length || r.files.length > 5000) throw Error('Invalid Google feed release');
  const seen = new Set<string>();
  for (const f of r.files) {
    if (!f || typeof f.path !== 'string' || !validFeedPath(f.path) || seen.has(f.path) || f.key !== GOOGLE_PREFIX + r.release + '/' + f.path || !Number.isSafeInteger(f.size) || f.size <= 0 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw Error('Invalid Google feed file');
    const expected = f.path.endsWith('.xml') ? 'application/xml' : f.path.endsWith('.pdf') ? 'application/pdf' : f.path.endsWith('.jpg') ? 'image/jpeg' : 'application/epub+zip';
    if (f.contentType !== expected) throw Error('Invalid Google feed content type');
    seen.add(f.path);
  }
  return r;
}
async function equal(a: string, b: string) {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function googleBooksFeed(request: Request, env: FeedEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/(?:onix|ebooks)(?:\/|$)/.test(url.pathname)) return null;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
  const response = (body: BodyInit | null, status = 200, more: Record<string, string> = {}) => new Response(body, { status, headers: { ...headers, ...more } });
  if (!['validation', 'live'].includes(env.GOOGLE_BOOKS_FEED_MODE || '')) return response('Not found', 404);
  if (!/^[A-Za-z0-9]{1,64}$/.test(env.GOOGLE_BOOKS_FEED_USERNAME || '') || !/^[A-Za-z0-9]{32,128}$/.test(env.GOOGLE_BOOKS_FEED_PASSWORD || '')) return response('Feed configuration incomplete', 503);
  const wanted = 'Basic ' + btoa(env.GOOGLE_BOOKS_FEED_USERNAME + ':' + env.GOOGLE_BOOKS_FEED_PASSWORD);
  if (!await equal(request.headers.get('authorization') || '', wanted)) return response('Authentication required', 401, { 'WWW-Authenticate': 'Basic realm="Google Books feed", charset="UTF-8"' });
  if (!['GET', 'HEAD'].includes(request.method)) return response('Method not allowed', 405, { Allow: 'GET, HEAD' });
  if (!env.BUCKET) return response('Feed storage unavailable', 503);
  try {
    const object = await env.BUCKET.get(GOOGLE_PREFIX + 'active.json');
    if (!object) return response('No approved release staged', 503);
    const release = validateRelease(await object.json());
    const files = release.files.filter(f => env.GOOGLE_BOOKS_FEED_MODE === 'live' || f.path.startsWith('onix/validate/'));
    const path = url.pathname.slice(1);
    if (path.includes('%') || path.includes('\\') || path.includes('//')) return response('Not found', 404);
    if (path.endsWith('/') || path === 'onix' || path === 'ebooks') {
      const prefix = path.endsWith('/') ? path : path + '/';
      const children = new Map<string, FeedEntry | null>();
      for (const file of files.filter(f => f.path.startsWith(prefix))) {
        const rest = file.path.slice(prefix.length); const name = rest.includes('/') ? rest.split('/')[0] + '/' : rest;
        children.set(name, name.endsWith('/') ? null : file);
      }
      if (!children.size) return response('Not found', 404);
      const rows = [...children].sort(([a], [b]) => a.localeCompare(b)).map(([name, file]) => '<tr><td><a href="/' + xml(prefix + name) + '">' + xml(name) + '</a></td><td>' + (file?.size ?? '-') + '</td><td>' + xml(release.modified) + '</td></tr>').join('');
      return response(request.method === 'HEAD' ? null : '<!doctype html><meta charset="utf-8"><title>Book feed</title><table><tr><th>Name</th><th>Bytes</th><th>Modified UTC</th></tr>' + rows + '</table>', 200, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    const file = files.find(f => f.path === path);
    if (!file) return response('Not found', 404);
    const stored = await env.BUCKET.get(file.key);
    if (!stored || stored.size !== file.size || stored.customMetadata?.sha256 !== file.sha256) return response('Release file unavailable', 503);
    const info = { 'Content-Type': file.contentType, 'Content-Length': String(file.size), 'Last-Modified': new Date(release.modified).toUTCString(), ETag: '"' + file.sha256 + '"' };
    if (request.headers.get('if-none-match') === info.ETag) return response(null, 304, { ETag: info.ETag });
    return response(request.method === 'HEAD' ? null : stored.body, 200, info);
  } catch { return response('Feed release unavailable', 503); }
}
