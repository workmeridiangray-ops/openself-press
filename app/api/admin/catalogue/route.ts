import {env} from 'cloudflare:workers';
import {user,isStaff,db,list,record,reply,change,audit} from '../../../../lib/server';
import {digest} from '../../../../lib/author-auth';
import {bookIdentity,IMPORT_LIMIT,normalizeCatalogueBook} from '../../../../lib/catalogue-import';
export const dynamic='force-dynamic';
const fail=(message:string,status=400)=>Object.assign(Error(message),{status});
async function operator(){const u=await user();if(!isStaff(u))throw fail('Staff access required',403);return u;}
const duplicates=(a:any,b:any)=>bookIdentity(a)===bookIdentity(b)||!!(a.isbn&&b.isbn&&String(a.isbn).replace(/[-\s]/g,'')===String(b.isbn).replace(/[-\s]/g,''))||!!(a.sku&&b.sku&&String(a.sku).toLowerCase()===String(b.sku).toLowerCase());
const listingId=(data:any)=>'catalogue-'+digest(data.isbn?'isbn:'+data.isbn:bookIdentity(data));
const coverURL=(id:string)=>'/api/catalogue/cover?id='+encodeURIComponent(id);

export async function GET(){try{await operator();return reply({books:await list('Catalogue')});}catch(e:any){return reply({error:e.message},e.status||(e.message==='Sign in required'?401:400));}}

export async function POST(req:Request){try{
  if(req.headers.get('origin')!==new URL(req.url).origin)throw fail('Invalid request origin',403);
  const u=await operator();
  if(Number(req.headers.get('content-length')||0)>6_000_000)throw fail('Request too large',413);
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
    const form=await req.formData();const file=form.get('file');
    if(!(file instanceof File)||file.size<12||file.size>5_000_000)throw Error('Upload a PNG, JPEG or WebP cover up to 5 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    const mime=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':'';
    if(!mime||file.type!==mime)throw Error('The cover must be a valid PNG, JPEG or WebP image.');
    const coverKey='catalogue-covers/'+digest(u.userId).slice(0,16)+'/'+crypto.randomUUID();
    await env.BUCKET!.put(coverKey,bytes,{httpMetadata:{contentType:mime}});
    return reply({ok:true,coverKey});
  }
  const raw=await req.text();if(raw.length>2_000_000)throw fail('Request too large',413);
  const b=JSON.parse(raw);const existing=await list('Catalogue');
  if(b.action==='preview'||b.action==='import'){
    if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>IMPORT_LIMIT)throw Error('Import between 1 and '+IMPORT_LIMIT+' books.');
    const status=b.status||'Draft';if(!['Draft','Published'].includes(status))throw Error('Import as Draft or Published.');
    const seen:any[]=[];const results=b.rows.map((input:any,index:number)=>{
      try{const data=normalizeCatalogueBook(input,status);if(data.cover.startsWith('/'))throw Error('Bulk imports require HTTPS cover URLs. Upload covers individually after saving drafts.');if(existing.some(r=>duplicates(r.data,data)))throw Error('This SKU or ISBN/book already exists. Edit the existing listing.');if(seen.some(d=>duplicates(d,data)))throw Error('Duplicate book in this upload.');seen.push(data);return {row:index+2,data,error:''};}
      catch(e:any){return {row:index+2,data:null,error:e.message};}
    });
    if(b.action==='preview')return reply({rows:results,valid:results.filter((r:any)=>!r.error).length,total:results.length});
    if(results.some((r:any)=>r.error))return reply({error:'Fix the highlighted rows before importing. No books were saved.',rows:results},400);
    if(status==='Published'&&b.rightsConfirmed!==true)throw Error('Confirm that you may sell these books and use their covers.');
    const now=new Date().toISOString();const queries=results.flatMap((r:any)=>{
      const id=listingId(r.data);const data={...r.data,listingSource:'direct',rightsConfirmedAt:status==='Published'?now:undefined};
      return [db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(id,u.userId,'Catalogue',status,JSON.stringify(data),now,now),db().prepare('INSERT INTO activity VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,u.email,'Imported catalogue listing as '+status,now)];
    });
    try{await db().batch(queries);}catch{throw fail('The catalogue changed during import. Preview again; no books from this upload were saved.',409);}
    return reply({ok:true,count:results.length,status});
  }
  if(b.action!=='save')throw Error('Unknown catalogue action.');
  const prior=b.id?await record(b.id):null;
  if(prior&&prior.kind!=='Catalogue')throw Error('Choose a catalogue listing.');
  if(prior&&Number(b.version)!==prior.version)throw fail('This listing changed. Refresh before saving.',409);
  const status=b.status||'Draft';
  const uploaded=String(Object.hasOwn(b,'coverKey')?b.coverKey:prior?.data.coverKey||'');
  if(uploaded&&!/^catalogue-covers\/[a-f0-9]{16}\/[a-f0-9-]{36}$/.test(uploaded))throw Error('Upload the cover again.');
  // Uploaded files are dedicated public catalogue images, never manuscript or receipt keys.
  const data:any=normalizeCatalogueBook(b,status,!!uploaded);
  const id=prior?.id||listingId(data);
  if(existing.some(r=>r.id!==id&&duplicates(r.data,data)))throw Error('This SKU or ISBN/book already exists. Edit the existing listing.');
  if(!prior&&existing.some(r=>r.id===id))throw fail('This book already exists. Edit its listing.',409);
  if(data.cover.startsWith('/api/')&&(!uploaded||data.cover!==coverURL(id)))throw Error('Use an HTTPS cover URL or upload a cover.');
  if(status==='Published'&&b.rightsConfirmed!==true)throw Error('Confirm that you may sell this book and use its cover.');
  if(prior?.data.bookReference){
    // Editing a production-linked listing never detaches it or bypasses its approval gate.
    data.bookReference=prior.data.bookReference;data.authorOwner=prior.data.authorOwner;
    if(status==='Published'){const book=await record(data.bookReference);if(book.kind!=='Publishing'||!book.data.isbn||!['In production','Ready to ship','Dispatched','Delivered','Completed','Published'].includes(book.status))throw Error('Complete the linked edition ISBN and final approvals first.');data.authorOwner=book.owner;}
  }
  data.coverKey=uploaded||undefined;
  if(uploaded)data.cover=coverURL(id);
  data.listingSource=prior?.data.bookReference?'production':'direct';
  data.rightsConfirmedAt=status==='Published'?new Date().toISOString():prior?.data.rightsConfirmedAt;
  if(prior){try{await change(prior,status,{...prior.data,...data});}catch{throw fail('This listing changed. Refresh before saving.',409);}}
  else {const now=new Date().toISOString();try{await db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(id,u.userId,'Catalogue',status,JSON.stringify(data),now,now).run();}catch{throw fail('This book already exists. Refresh the catalogue.',409);}}
  await audit(id,u.email,'Catalogue listing saved as '+status);
  return reply({ok:true,id,status});
}catch(e:any){return reply({error:e.message||'Unable to save catalogue'},e.status||(e.message==='Sign in required'?401:400));}}
