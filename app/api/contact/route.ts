import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const json=(v:any,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
const clean=(v:any,n=200)=>String(v||'').trim().slice(0,n);
const digest=async(s:string)=>{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,'0')).join('')};

// Public enquiry form: works without signing in. Stored as an 'Enquiries' record
// that staff see under the Enquiries module in the operations area.
export async function POST(req:Request){
  try{
    const url=new URL(req.url);
    if(req.headers.get('origin')!==url.origin)return json({error:'Invalid request origin'},403);
    if(Number(req.headers.get('content-length')||0)>12000)return json({error:'Request too large'},413);
    const raw=await req.text();
    if(raw.length>12000)return json({error:'Request too large'},413);
    const b:any=JSON.parse(raw);

    // Honeypot: real visitors never see or fill this field.
    if(clean(b.website,200))return json({ok:true});

    const name=clean(b.name,120); if(!name)throw Error('Enter your name');
    const email=clean(b.email,200).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address');
    const phone=clean(b.phone,20); if(phone&&!/^[0-9+()\- ]{7,20}$/.test(phone))throw Error('Enter a valid phone number or leave it blank');
    const subject=clean(b.subject,150)||'Website enquiry';
    const message=clean(b.message,3000); if(message.length<10)throw Error('Write a message of at least 10 characters');

    const ip=req.headers.get('cf-connecting-ip')||'unknown';
    const bucketId=await digest('contact|ip|'+ip);
    const now=Date.now();
    await db().prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(bucketId,now+3600000,now,now,now+3600000).run();
    const bucket=await db().prepare('SELECT count FROM auth_limits WHERE id=?').bind(bucketId).first<any>();
    if(bucket&&bucket.count>5){const e:any=Error('Too many messages from this connection. Please try again later.');e.status=429;throw e}

    const id=crypto.randomUUID();
    const iso=new Date().toISOString();
    const data={title:subject,author:name,name,email,phone,message,source:'contact-page'};
    await db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(id,'enquiry-public','Enquiries','New',JSON.stringify(data),iso,iso).run();
    await db().prepare('INSERT INTO activity VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,email,'Website enquiry received',iso).run();
    return json({ok:true,id});
  }catch(e:any){return json({error:e.message||'Unable to send your message'},e.status||400)}
}
