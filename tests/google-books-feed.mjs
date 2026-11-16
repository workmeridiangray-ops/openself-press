import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { build, validateBook } from '../scripts/build-google-books-feed.mjs';
const compiled = ts.transpileModule(await readFile('lib/google-books-feed.ts','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { googleBooksFeed, GOOGLE_PREFIX, validateRelease } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
let checks = 0; const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
const bad = fn => { assert.throws(fn); checks++; };
const tmp = await mkdtemp(join(tmpdir(),'google-feed-'));
try {
  // Synthetic fixture only, never uploaded. Assertion flags are not proof of allocation.
  const book = { isbn:'9780306406157', isbnAllocationVerified:true, digitalRightsConfirmed:true, finalFilesApproved:true, kdpSelect:false, title:'A & B <one>', description:'Text & more', authors:['A Writer'], language:'eng', publicationDate:'2026-01-01', countries:['IN'], currency:'INR', priceMinor:9950, priceTypeCode:'02', format:'pdf', contentPath:'interior.pdf', coverPath:'front.jpg' };
  for (const change of [{isbn:'9780000000002'},{isbn:'9780306406158'},{isbnAllocationVerified:false},{digitalRightsConfirmed:false},{finalFilesApproved:false},{kdpSelect:true},{countries:['WORLD']},{countries:['IN','IN']},{publicationDate:'2026-02-30'},{publicationDate:'2999-01-01'},{priceMinor:0},{priceTypeCode:'xx'},{authors:[]},{title:'\u0001'}]) bad(() => validateBook({...book,...change}));
  await writeFile(join(tmp,'interior.pdf'),'%PDF-1.4\nSynthetic test'); await writeFile(join(tmp,'front.jpg'),Buffer.from([255,216,255,0]));
  const input = join(tmp,'books.json'); await writeFile(input,JSON.stringify({collection:'A0HEG97',publisher:'OpenShelf Press',release:'Release1',books:[book]}));
  const out=join(tmp,'release'); const release=await build(input,out); eq(release.files.length,5);
  await assert.rejects(build(input,out)); checks++;
  const sample = await readFile(join(out,release.files[0].path),'utf8');
  eq(sample.includes('A &amp; B &lt;one&gt;'),true); eq(sample.includes('<PriceAmount>99.50</PriceAmount>'),true); eq(sample.includes('<RightsCountry>IN</RightsCountry>'),true);
  const full = await readFile(join(out,release.files[1].path),'utf8'); eq(full.includes('<SupplyDetail>'),false);
  // Parse independently; this is XML well-formedness, not Google's ONIX approval.
  const {execFileSync} = await import('node:child_process');
  execFileSync('python3',['-c','import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'],{input:sample}); checks++;
  const stored = new Map(); stored.set(GOOGLE_PREFIX+'active.json',{json:async()=>release});
  for (const f of release.files) { const body=await readFile(join(out,f.path)); stored.set(f.key,{size:body.length,body,customMetadata:{sha256:createHash('sha256').update(body).digest('hex')}}); }
  const env={GOOGLE_BOOKS_FEED_MODE:'validation',GOOGLE_BOOKS_FEED_USERNAME:'GoogleBooks',GOOGLE_BOOKS_FEED_PASSWORD:'a'.repeat(64),BUCKET:{get:async key=>stored.get(key)}};
  const authorization='Basic '+btoa('GoogleBooks:'+env.GOOGLE_BOOKS_FEED_PASSWORD);
  const get=(path,extra={},config=env)=>googleBooksFeed(new Request('https://books.test/'+path,{...extra,headers:{authorization,...extra.headers}}),config);
  eq(await get('bookstore'),null); eq((await get('onix/',{},{})).status,404);
  eq((await get('onix/',{headers:{authorization:''}})).status,401);
  eq((await get('onix/',{method:'POST'})).status,405);
  eq((await get('onix/',{}, {...env,GOOGLE_BOOKS_FEED_PASSWORD:'short'})).status,503);
  eq((await get('onix/')).status,200); eq((await get('onix/validate/')).status,200);
  eq((await get('onix/A0HEG97-rights/')).status,404); eq((await get('ebooks/')).status,404);
  const sampleResponse=await get(release.files[0].path); eq(sampleResponse.status,200); eq(await sampleResponse.text(),sample);
  eq((await get(release.files[0].path,{method:'HEAD'})).body,null);
  eq((await get(release.files[0].path,{headers:{'if-none-match':'"'+release.files[0].sha256+'"'}})).status,304);
  env.GOOGLE_BOOKS_FEED_MODE='live'; eq((await get('ebooks/A0HEG97/')).status,200);
  const pdf=release.files.find(f=>f.path.endsWith('.pdf')); eq((await get(pdf.path)).status,200);
  eq((await get('ebooks/A0HEG97/secret.pdf')).status,404);
  eq((await get('onix/A0HEG97-rights/')).status,200);
  const original=stored.get(pdf.key); stored.set(pdf.key,{...original,customMetadata:{sha256:'bad'}}); eq((await get(pdf.path)).status,503);
  stored.delete(GOOGLE_PREFIX+'active.json'); eq((await get('onix/')).status,503);
  for (const change of [{key:'private/manuscript'},{path:'onix/validate/../../private.xml'},{size:0},{sha256:'bad'}]) bad(()=>validateRelease({...release,files:[{...release.files[0],...change}]}));
  bad(()=>validateRelease({...release,files:[release.files[0],release.files[0]]}));
  console.log(checks+' Google Books packaging and feed checks passed. No external calls.');
} finally { await rm(tmp,{recursive:true,force:true}); }
