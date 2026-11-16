/* eslint-disable @typescript-eslint/no-explicit-any -- Existing D1 JSON record boundary; network fields are validated before use. */
import {user,staff,record,reply,db,secrets,audit,change} from '../../../lib/server';
import {printingStatus,transferPrintJob,syncPrintJob,retryPrintJob,snapshotPrintItems} from '../../../lib/printing';
import {printConfig} from '../../../lib/printing-contract';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const u=await user();staff(u);const id=new URL(req.url).searchParams.get('order');const jobs=(await (id?db().prepare('SELECT * FROM printing_jobs WHERE order_id=?').bind(id):db().prepare('SELECT * FROM printing_jobs ORDER BY updated DESC LIMIT 100')).all()).results;return reply({status:printingStatus(),jobs})}catch(e:any){return reply({error:e.message},403)}}
export async function POST(req:Request){try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);
  const u=await user();staff(u);
  const b:any=await req.json();
  if(b.action==='configure-edition'){
    const r=await record(b.id);if(r.kind!=='Publishing'||r.version!==b.version)throw Error('Refresh the book edition before configuring printing');
    const config=printConfig(b.config,r.data.pageCount);
    await change(r,r.status,{...r.data,printingConfig:config});
    await audit(r.id,u.email,'Approved the print size mapping, paper, page split and per-copy weight');
    return reply({ok:true});
  }
  if(b.action==='prepare-existing'){
    const r=await record(b.id);if(r.kind!=='Orders'||!['Paid','Awaiting payment'].includes(r.status)||b.confirmed!==true)throw Error('Confirm staff review of this existing order and its edition files');
    const items=await snapshotPrintItems(r.data.items||[],r.data.orderType==='Author copies');
    if(!items.length)throw Error('The order has no printable book items');
    for(const item of items)for(const file of Object.values(item.files) as any[])if(!await secrets().BUCKET.head(file.key))throw Error('An approved PDF is missing');
    // Existing snapshots are never replaced: the staff action only backfills older orders.
    await db().batch([db().prepare('INSERT OR IGNORE INTO printing_snapshots VALUES(?,?,?)').bind(r.id,JSON.stringify(items),new Date().toISOString()),db().prepare("INSERT OR IGNORE INTO printing_jobs(order_id,state,updated) SELECT ?,'Queued',? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND status='Paid')").bind(r.id,new Date().toISOString(),r.id)]);
    await audit(r.id,u.email,'Confirmed legacy paid order against current approved files; queued for printing');
    return reply({ok:true});
  }
  if(b.action==='transfer')return reply(await transferPrintJob(b.id));
  if(b.action==='retry')return reply(await retryPrintJob(b.id,u));
  if(b.action==='sync')return reply(await syncPrintJob(b.id));
  throw Error('Unknown printing action');
}catch(e:any){return reply({error:e.message||'Unable to process printing request'},400)}}
