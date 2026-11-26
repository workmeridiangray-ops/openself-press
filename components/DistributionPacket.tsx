import React, {useState} from 'react';
import {Copy, Check, ExternalLink} from 'lucide-react';

const BISAC: Record<string, string[]> = {
  'Fiction — thriller / mystery': ['FICTION / Thrillers / Suspense', 'FICTION / Mystery & Detective / General'],
  'Fiction — general': ['FICTION / General', 'FICTION / Literary'],
  'Fiction': ['FICTION / General', 'FICTION / Literary'],
  'Academic / textbook': ['EDUCATION / General', 'STUDY AIDS / General'],
  'Academic': ['EDUCATION / General', 'STUDY AIDS / General'],
  'Children': ["JUVENILE FICTION / General", "JUVENILE NONFICTION / General"],
  'Self-help': ['SELF-HELP / General', 'BODY, MIND & SPIRIT / General'],
  'Poetry': ['POETRY / General', 'POETRY / Subjects & Themes / General'],
  'Romance': ['FICTION / Romance / General', 'FICTION / Romance / Contemporary'],
};
const bisacFor = (genre: string) => BISAC[genre] || ['FICTION / General', 'NONFICTION / General'];

function Field({label, value, note}: {label: string; value: string; note?: string}) {
  const [copied, setCopied] = useState(false);
  return <div className="packet-field">
    <div className="packet-field-head"><label>{label}</label>
      <button type="button" className="packet-copy" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <pre>{value || '—'}</pre>
    {note && <small className="muted">{note}</small>}
  </div>;
}

export default function DistributionPacket({d}: {d: any}) {
  const keywords = (d.keywords ? String(d.keywords).split(',').map((k: string) => k.trim()).filter(Boolean) : []).slice(0, 7);
  while (keywords.length < 7) keywords.push(d.genre || 'fiction');
  const categories = bisacFor(d.genre);
  const price = (p?: number) => p ? '₹' + Number(p).toFixed(2) : 'not set';

  return <div className="distribution-packet">
    <p className="muted">Everything below is ready to paste into KDP, Draft2Digital, or any other distributor's upload form. Get the interior PDF and cover file from their own records on this book, as usual — this packet covers the metadata only.</p>
    <Field label="Title" value={d.title} />
    {d.subtitle && <Field label="Subtitle" value={d.subtitle} />}
    <Field label="Author name" value={d.contactName || d.author} />
    <Field label="Description / blurb" value={d.blurb || d.synopsis || ''} note="KDP accepts basic HTML: <b>, <i>, <p>, <br>." />
    <Field label="Author bio" value={d.authorBio || ''} />
    <Field label="7 KDP keywords (one per box)" value={keywords.join('\n')} />
    <Field label="2 BISAC / browse categories" value={categories.join('\n')} note="Pick the closest match in each platform's own category picker — exact wording varies by store." />
    <Field label="Language" value={d.language || 'English'} />
    <Field label="Trim size / binding" value={(d.trimSize || '—') + ' · ' + (d.binding || 'Paperback') + ' · ' + (d.interiorColor || 'Black & white') + (d.pageCount ? ' · ' + d.pageCount + ' pages' : '')} />
    {d.isbn && <Field label="ISBN (if the platform asks for your own)" value={d.isbn} note="Otherwise let KDP assign its own free ISBN for that edition — don't reuse this one across platforms unless it's a universal ISBN you bought yourself." />}
    <div className="packet-field"><div className="packet-field-head"><label>List prices</label></div>
      <ul className="packet-prices">
        {d.formatPrices?.indiaPaperback && <li>Paperback (India): {price(d.formatPrices.indiaPaperback)}</li>}
        {d.formatPrices?.internationalPaperback && <li>Paperback (international): ${d.formatPrices.internationalPaperback}</li>}
        {d.formatPrices?.ebook && <li>eBook: {price(d.formatPrices.ebook)}</li>}
        {!d.formatPrices && <li>{price(d.retailPrice)}</li>}
      </ul>
      <small className="muted">Enter the India price directly; for other marketplaces (US, UK, etc.) each platform auto-converts unless you override it.</small>
    </div>
    <div className="packet-field"><div className="packet-field-head"><label>Platform checklist</label></div>
      <ul className="packet-checklist">
        <li>KDP (Amazon): sign in, create a new title, paste the fields above, upload interior + cover, set territories to Worldwide, choose 60% or 35% royalty, Publish.</li>
        <li>Draft2Digital: sign in, "Add a Book", same metadata, upload EPUB + cover, choose retailers (don't include Amazon here if KDP already covers it, to avoid duplicate listings), Publish.</li>
        <li>IngramSpark (optional, for library/bookstore reach): needs its own cover + interior PDF with IngramSpark's exact bleed/margin spec — check before uploading, it's stricter than KDP's.</li>
      </ul>
    </div>
    <a className="text-link" href="https://kdp.amazon.com/en_US/title-setup/paperback/new" target="_blank" rel="noreferrer">Open KDP new-title page<ExternalLink size={14} /></a>
  </div>;
}
