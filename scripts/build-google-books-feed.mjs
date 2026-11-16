// Local packaging only. Does not upload, deploy, enable sales, or contact Google.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = await readFile(new URL('../lib/google-books-feed.ts', import.meta.url), 'utf8');
const model = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64'));
const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const tag = (name, text) => '<' + name + '>' + xml(text) + '</' + name + '>';
const text = (s, label) => { if (typeof s !== 'string' || !s.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw Error('Missing or invalid ' + label); return s.trim(); };
export function validateBook(b) {
  if (!b || !/^(978|979)\d{10}$/.test(b.isbn || '') || [...b.isbn].reduce((n, d, i) => n + Number(d) * (i % 2 ? 3 : 1), 0) % 10 || b.isbn === '9780000000002') throw Error('A valid allocated eISBN is required; test placeholders are excluded');
  if (b.isbnAllocationVerified !== true || b.digitalRightsConfirmed !== true || b.finalFilesApproved !== true || b.kdpSelect !== false) throw Error('Confirm eISBN allocation, digital rights, approved files, and no KDP Select exclusivity');
  text(b.title, 'title'); text(b.description, 'description');
  if (!Array.isArray(b.authors) || !b.authors.length) throw Error('Authors required'); b.authors.forEach(a => text(a, 'author'));
  if (!/^[a-z]{3}$/.test(b.language || '')) throw Error('Use an ISO 639-2/B language code');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.publicationDate || '') || !Number.isFinite(Date.parse(b.publicationDate)) || new Date(b.publicationDate).toISOString().slice(0, 10) !== b.publicationDate || b.publicationDate > new Date().toISOString().slice(0,10)) throw Error('Use a valid publication date on or before today; preorders are not supported by this packager');
  if (!Array.isArray(b.countries) || !b.countries.length || b.countries.some(c => !/^[A-Z]{2}$/.test(c)) || new Set(b.countries).size !== b.countries.length) throw Error('Explicit ISO country list required');
  // Restrict the initial integration to two-decimal currencies and explicit markets.
  if (!['INR','USD','GBP','EUR','AUD','CAD'].includes(b.currency) || !Number.isSafeInteger(b.priceMinor) || b.priceMinor <= 0 || !['01','02','03','04','41','42'].includes(b.priceTypeCode)) throw Error('Confirm currency, positive price in minor units, and ONIX price type matching Payment Centre');
  if (!['pdf','epub'].includes(b.format)) throw Error('Choose pdf or epub');
  text(b.contentPath, 'content path'); text(b.coverPath, 'front JPEG path');
  return b;
}
function product(b, publisher, rights) {
  const countries = b.countries.join(' ');
  const basic = tag('RecordReference', b.isbn) + tag('NotificationType', '03') + '<ProductIdentifier>' + tag('ProductIDType', '15') + tag('IDValue', b.isbn) + '</ProductIdentifier>' + tag('ProductForm', 'DG') + tag('EpubType', b.format === 'pdf' ? '002' : '029') + '<Title>' + tag('TitleType', '01') + tag('TitleText', b.title) + '</Title>' + b.authors.map(a => '<Contributor>' + tag('ContributorRole', 'A01') + tag('PersonName', a) + '</Contributor>').join('') + '<Language>' + tag('LanguageRole', '01') + tag('LanguageCode', b.language) + '</Language>' + '<OtherText>' + tag('TextTypeCode', '03') + tag('Text', b.description) + '</OtherText><Publisher>' + tag('NameCodeType','02') + tag('NameCodeValue',publisher) + '</Publisher>' + tag('PublishingStatus', '04') + tag('PublicationDate', b.publicationDate.replaceAll('-', ''));
  const sales = '<SalesRights>' + tag('SalesRightsType', '02') + tag('RightsCountry', countries) + '</SalesRights><SupplyDetail>' + tag('SupplierName', publisher) + tag('SupplyToCountry', countries) + tag('ProductAvailability', '20') + b.countries.map(c => '<Price>' + tag('PriceTypeCode', b.priceTypeCode) + tag('PriceAmount', (b.priceMinor / 100).toFixed(2)) + tag('CurrencyCode', b.currency) + tag('CountryCode', c) + '</Price>').join('') + '</SupplyDetail>';
  return '<Product>' + basic + (rights ? sales : '') + '</Product>';
}
export async function build(inputPath, outputPath) {
  const input = JSON.parse(await readFile(inputPath, 'utf8')); const publisher = text(input.publisher, 'publisher');
  if (input.collection !== model.GOOGLE_COLLECTION || !/^[A-Za-z0-9]{1,64}$/.test(input.release || '') || !Array.isArray(input.books) || !input.books.length || input.books.length > 1000) throw Error('Choose collection A0HEG97, an alphanumeric release ID and 1–1000 approved books');
  const books = input.books.map(validateBook);
  if (new Set(books.map(b => b.isbn)).size !== books.length) throw Error('Duplicate eISBN');
  const modified = new Date().toISOString(); const stamp = modified.replace(/[-:TZ.]/g, '').slice(0,12);
  const message = (items, rights) => '<?xml version="1.0" encoding="UTF-8"?>\n<ONIXMessage xmlns="http://www.editeur.org/onix/2.1/reference"><Header>' + tag('FromCompany', publisher) + tag('SentDate', stamp) + '</Header>' + items.map(b => product(b, publisher, rights)).join('') + '</ONIXMessage>\n';
  const pending = [];
  const add = (path, bytes, contentType) => pending.push({ path, bytes: Buffer.from(bytes), contentType });
  add('onix/validate/openshelf_' + input.release + '.xml', message(books.slice(0,1),true), 'application/xml');
  add('onix/A0HEG97-full/openshelf_' + input.release + '.xml', message(books,false), 'application/xml');
  add('onix/A0HEG97-rights/openshelf_' + input.release + '.xml', message(books,true), 'application/xml');
  for (const b of books) {
    const bytes = await readFile(resolve(dirname(inputPath), b.contentPath));
    if (b.format === 'pdf' ? bytes.subarray(0,5).toString() !== '%PDF-' : bytes[0] !== 80 || bytes[1] !== 75) throw Error('Invalid content file signature for ' + b.isbn);
    const cover = await readFile(resolve(dirname(inputPath), b.coverPath));
    if (cover[0] !== 255 || cover[1] !== 216 || cover[2] !== 255) throw Error('Front cover must be JPEG');
    add('ebooks/A0HEG97/' + b.isbn + (b.format === 'pdf' ? '_interior.pdf' : '.epub'), bytes, b.format === 'pdf' ? 'application/pdf' : 'application/epub+zip');
    add('ebooks/A0HEG97/' + b.isbn + '_frontcover.jpg', cover, 'image/jpeg');
  }
  const manifest = model.validateRelease({ collection: input.collection, release: input.release, modified, files: pending.map(f => ({ path: f.path, key: model.GOOGLE_PREFIX + input.release + '/' + f.path, size: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex'), contentType: f.contentType })) });
  // Never overwrite a release directory; a changed book must have a new release.
  await mkdir(outputPath, { recursive: false });
  for (const f of pending) { const path = join(outputPath, f.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, f.bytes); }
  await writeFile(join(outputPath, 'active.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw Error('Usage: node scripts/build-google-books-feed.mjs approved-books.json NEW_OUTPUT_DIRECTORY');
  const release = await build(resolve(process.argv[2]), resolve(process.argv[3]));
  console.log('Prepared ' + release.files.length + ' files locally. Nothing uploaded or published.');
}
