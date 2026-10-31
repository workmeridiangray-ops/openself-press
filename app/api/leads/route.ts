import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const json=(v:any,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
const clean=(v:any,n=200)=>String(v||'').trim().slice(0,n);
const digest=async(s:string)=>{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,'0')).join('')};
function genCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<6;i++)out+=chars[Math.floor(Math.random()*chars.length)];return 'MP100-'+out}

export async function POST(req:Request){
  try{
    const url=new URL(req.url);
    if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return json({error:'Invalid request origin'},403);
    if(Number(req.headers.get('content-length')||0)>12000)return json({error:'Request too large'},413);
    const raw=await req.text();
    if(raw.length>12000)return json({error:'Request too large'},413);
    const b:any=JSON.parse(raw);

    const name=clean(b.name,120); if(!name)throw Error('Enter your full name');
    const phone=clean(b.phone,20); if(!/^[0-9+()\- ]{7,20}$/.test(phone))throw Error('Enter a valid phone number');
    const email=clean(b.email,200).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address');
    const country=clean(b.country,80),state=clean(b.state,80),city=clean(b.city,80),pin=clean(b.pin,12);
    if(!country||!state||!city||!pin)throw Error('Complete your address details');
    const howHeard=clean(b.howHeard,60); if(!howHeard)throw Error('Tell us how you heard about us');
    const howHeardOther=clean(b.howHeardOther,120),handle=clean(b.handle,100);
    const genre=clean(b.genre,60),language=clean(b.language,40),stage=clean(b.stage,40);
    if(!genre||!language||!stage)throw Error('Complete your manuscript details');
    const completionTime=clean(b.completionTime,40);
    const booksPlanned=clean(b.booksPlanned,40); if(!booksPlanned)throw Error('Choose how many books you plan to publish');
    const authorCopies=Number(b.authorCopies); if(!Number.isFinite(authorCopies)||authorCopies<0||authorCopies>500)throw Error('Enter a valid number of author copies');
    const extrasWanted=Array.isArray(b.extrasWanted)?b.extrasWanted.map((x:any)=>clean(x,40)).filter(Boolean).slice(0,10):[];
    const extrasOther=clean(b.extrasOther,150);
    const note=clean(b.note,500);

    const ip=req.headers.get('cf-connecting-ip')||'unknown';
    const bucketId=await digest('leads|ip|'+ip);
    const now=Date.now();
    await db().prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(bucketId,now+3600000,now,now,now+3600000).run();
    const bucketRow=await db().prepare('SELECT count FROM auth_limits WHERE id=?').bind(bucketId).first<any>();
    if(bucketRow&&bucketRow.count>5){const e:any=Error('Too many applications from this connection. Please try again later.');e.status=429;throw e}

    let accessCode='';
    for(let i=0;i<5;i++){
      const candidate=genCode();
      const exists=await db().prepare("SELECT id FROM records WHERE kind='Leads' AND json_extract(data,'$.code')=?").bind(candidate).first();
      if(!exists){accessCode=candidate;break}
    }
    if(!accessCode)throw Error('Could not generate a code. Please try again.');

    const data={name,phone,email,country,state,city,pin,howHeard,howHeardOther,handle,genre,language,stage,completionTime,booksPlanned,authorCopies,extrasWanted,extrasOther,note,code:accessCode,source:'free-publishing-landing'};
    const id=crypto.randomUUID();
    const iso=new Date().toISOString();
    await db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(id,'lead-public','Leads','New',JSON.stringify(data),iso,iso).run();

    return json({ok:true,code:accessCode});
  }catch(e:any){return json({error:e.message||'Unable to submit your application'},e.status||400)}
}
