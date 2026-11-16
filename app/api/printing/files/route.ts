/* eslint-disable @typescript-eslint/no-explicit-any -- Existing D1 JSON record boundary; network fields are validated before use. */
import {db,secrets,reply} from '../../../../lib/server';
import {authenticatePrintRequest} from '../../../../lib/printing-contract';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
  const e=secrets();
  if(e.PRINTING_ENABLED!=='1'||!await authenticatePrintRequest(req,e.PRINTING_SECRET||''))return reply({error:'Not authorised'},403);
  const u=new URL(req.url),id=u.searchParams.get('order')||'',index=Number(u.searchParams.get('item')),kind=u.searchParams.get('kind');
  if(!Number.isInteger(index)||index<0||!['interior','cover'].includes(kind||''))return reply({error:'Invalid file reference'},400);
  const job=await db().prepare("SELECT j.remote_id,s.payload FROM printing_jobs j JOIN printing_snapshots s ON s.order_id=j.order_id JOIN records r ON r.id=j.order_id WHERE j.order_id=? AND r.status IN ('Paid','In production','Ready to ship','Dispatched','Delivered')").bind(id).first<any>();
  if(!job)return reply({error:'File not available'},404);
  const file=JSON.parse(job.payload)[index]?.files[kind!];
  if(!file)return reply({error:'File not available'},404);
  const object=await e.BUCKET.get(file.key);if(!object)return reply({error:'File not available'},404);
  const filename=String(file.filename).replace(/[^a-zA-Z0-9._-]/g,'_');
  return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+filename+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch{return reply({error:'Unable to retrieve approved file'},400)}}
