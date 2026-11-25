import {env} from 'cloudflare:workers';
const SITE='https://openshelfpress.com';
const STAFF=()=>String((env as any).STAFF_NOTIFY_EMAIL||'info@openshelfpress.com');
const emailReady=(e:any)=>!!(e?.EMAIL_FROM&&(e.BREVO_API_KEY||e.RESEND_API_KEY));

// Automatically turns an approved, ISBN-assigned book into a live bookstore listing
// the moment its interior and cover are both Approved — no staff "confirm publication" click.
export async function autoPublishIfReady(bookId: string) {
  try {
    const DB = env.DB!;
    const bookRow = await DB.prepare("SELECT * FROM records WHERE id=? AND kind='Publishing'").bind(bookId).first<any>();
    if (!bookRow) return;
    const d = JSON.parse(bookRow.data);
    if (bookRow.status === 'Published' || d.catalogueId) return;
    if (!d.isbn) return;
    const files = (await DB.prepare("SELECT * FROM records WHERE owner=? AND kind IN ('Files','Cover design')").bind(bookRow.owner).all<any>()).results
      .map((r: any) => ({ ...r, data: JSON.parse(r.data) }))
      .filter((r: any) => r.data.bookReference === bookId);
    const interior = files.find((f: any) => f.kind === 'Files');
    const cover = files.find((f: any) => f.kind === 'Cover design');
    if (!interior || interior.status !== 'Approved' || !cover || cover.status !== 'Approved') return;

    const isImageCover = /^image\/(png|jpeg)$/.test(cover.data.fileType || '');
    if (!isImageCover) {
      // Can't publish without a public cover image (cover file is a PDF). Flag staff instead of silently stalling forever.
      if (!d.autoPublishCoverFlagged) {
        await DB.prepare("UPDATE records SET data=json_set(data,'$.autoPublishCoverFlagged',1) WHERE id=?").bind(bookId).run();
        if (emailReady(env as any)) { try { const { sendEmail } = await import('./business'); await sendEmail(env as any, { to: STAFF(), subject: 'Auto-publish paused: ' + d.title, text: '"' + d.title + '" has an approved ISBN, interior and cover, but the cover file is not an image (PNG/JPG), so it cannot be auto-listed on the storefront. Upload an image cover or publish this one manually.' }); } catch {} }
      }
      return;
    }

    const coverUrl = SITE + '/api/cover?id=' + encodeURIComponent(cover.id);
    const pricePaise = Math.round((Number(d.retailPrice) || Number(d.formatPrices?.indiaPaperback) || 199) * 100);
    const now = new Date().toISOString();
    const existing = await DB.prepare("SELECT id FROM records WHERE kind='Catalogue' AND json_extract(data,'$.bookReference')=?").bind(bookId).first<any>();
    const catalogueId = existing?.id || ('catalogue-auto-' + bookId);
    const catalogueData = {
      title: d.title, subtitle: d.subtitle || '', author: d.contactName || d.author, genre: d.genre || 'Fiction',
      description: (d.blurb || d.synopsis || '').slice(0, 2000), tag: 'New', cover: coverUrl,
      color: '#dce4d1', accent: '#284f43', pricePaise, stock: 0,
      bookReference: bookId, authorOwner: bookRow.owner,
    };
    if (existing) {
      await DB.prepare('UPDATE records SET status=?,data=?,version=version+1,updated=? WHERE id=?').bind('Published', JSON.stringify(catalogueData), now, existing.id).run();
    } else {
      await DB.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(catalogueId, bookRow.owner, 'Catalogue', 'Published', JSON.stringify(catalogueData), now, now).run();
    }
    await DB.prepare('UPDATE records SET data=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify({ ...d, catalogueId, publishedAt: now }), now, bookId).run();
    await DB.prepare('INSERT INTO activity VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), bookId, 'auto-publish-agent', 'Automatically published: interior, cover and ISBN all approved', now).run();

    if (emailReady(env as any)) {
      try {
        const { sendEmail } = await import('./business');
        const { bookLive } = await import('./email-templates');
        const m = bookLive({ name: d.contactName || d.author, title: d.title, isbn: d.isbn, link: SITE + '/workspace', storeLink: SITE + '/book/' + catalogueId });
        await sendEmail(env as any, { to: d.contactEmail || d.email, subject: m.subject, text: m.text, html: m.html, key: 'autopub-' + bookId });
        await sendEmail(env as any, { to: STAFF(), subject: 'Auto-published: ' + d.title, text: '"' + d.title + '" was automatically published once its ISBN, interior and cover were all approved. Listing: ' + SITE + '/book/' + catalogueId });
      } catch {}
    }
  } catch {}
}
