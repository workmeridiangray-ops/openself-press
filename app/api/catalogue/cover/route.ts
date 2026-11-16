import {env} from 'cloudflare:workers';
import {record,user,isStaff,reply} from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
  const r=await record(new URL(req.url).searchParams.get('id')||'');
  if(r.kind!=='Catalogue'||!String(r.data.coverKey||'').startsWith('catalogue-covers/'))return reply({error:'Cover not found'},404);
  if(r.status!=='Published'){try{if(!isStaff(await user()))return reply({error:'Cover not found'},404);}catch{return reply({error:'Cover not found'},404);}}
  const file=await env.BUCKET!.get(r.data.coverKey);if(!file)return reply({error:'Cover not found'},404);
  const type=file.httpMetadata?.contentType||'';if(!['image/png','image/jpeg','image/webp'].includes(type))return reply({error:'Cover not found'},404);
  return new Response(file.body,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
}catch{return reply({error:'Cover not found'},404);}}
