import {env} from 'cloudflare:workers';
import {user,isStaff,list,db,change,audit,reply} from '../../../../../lib/server';
import {digest} from '../../../../../lib/author-auth';
import {bookIdentity} from '../../../../../lib/catalogue-import';
import {preparePackage} from '../../../../../lib/catalogue-package';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid request origin'},403);
  const u=await user();if(!isStaff(u))return reply({error:'Staff access required'},403);
  if(Number(req.headers.get('content-length')||0)>2_000_000)return reply({error:'Package must be smaller than 2 MB.'},413);
  const raw=await req.text();if(raw.length>2_000_000)return reply({error:'Package must be smaller than 2 MB.'},413);
  const b=JSON.parse(raw);if(!['preview','apply'].includes(b.action))throw Error('Choose preview or apply.');
  const plans=preparePackage(b.rows,await list('Catalogue'));
  const summary=plans.map(p=>({row:p.row,sku:p.sku,title:p.title,error:p.error,version:p.prior?.version||0,operation:p.prior?'Update':'Add',pricePaise:p.data?.pricePaise,printingCostPaise:p.data?.printingCostPaise,stock:p.data?.stock,cover:!!p.cover||!!p.data?.cover}));
  if(b.action==='preview')return reply({rows:summary,valid:plans.filter(p=>!p.error).length,total:plans.length});
  if(plans.some(p=>p.error))return reply({error:'Fix the package before saving. Nothing was saved.',rows:summary},400);
  if(plans.some(p=>b.versions?.[p.sku]!== (p.prior?.version||0)))return reply({error:'The catalogue changed. Preview the package again. Nothing was saved.'},409);
  const saved:string[]=[];
  for(const p of plans){try{
    const id=p.prior?.id||'catalogue-'+digest(bookIdentity(p.data));
    const data:any={...p.prior?.data,...p.data};
    if(p.cover){const key='catalogue-covers/'+digest(u.userId).slice(0,16)+'/'+crypto.randomUUID();await env.BUCKET!.put(key,p.cover.bytes,{httpMetadata:{contentType:p.cover.mime}});data.coverKey=key;data.cover='/api/catalogue/cover?id='+encodeURIComponent(id);}
    if(p.prior)await change(p.prior,p.status||'Draft',data);
    else {const now=new Date().toISOString();await db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').bind(id,u.userId,'Catalogue','Draft',JSON.stringify(data),now,now).run();}
    saved.push(p.sku);
    await audit(id,u.email,p.stockOnly?'Catalogue stock set to '+data.stock:'Prepared catalogue package: printing cost and retail price saved; ISBN '+(data.isbn?'retained':'blank'));
  }catch{return reply({ok:false,saved,count:saved.length,error:'Saved '+saved.length+' books. Stopped at '+p.sku+'. Refresh and preview remaining books before retrying.'});}}
  return reply({ok:true,saved,count:saved.length});
}catch(e:any){return reply({error:e.message||'Unable to save package'},e.message==='Sign in required'?401:400);}}
