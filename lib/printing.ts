/* eslint-disable @typescript-eslint/no-explicit-any -- Existing D1 JSON record boundary; network fields are validated before use. */
import {db,secrets,record,staff,audit,update} from './server';
import {emailReady} from './business';
import {printConfig,printCost,printAddress,printBinding,printProducts,nextPrintStage,digest,signedHeaders} from './printing-contract';

export const printingEnabled=()=>secrets().PRINTING_ENABLED==='1';
export function printingStatus(){return {enabled:printingEnabled(),configured:!!(secrets().PRINTING_SECRET?.length>=32),products:printProducts,mode:'Staff approval required'}}
const now=()=>new Date().toISOString();

// Build on the server from the catalogue and proof records; never trust client file IDs.
export async function snapshotPrintItems(items:any[],authorCopies=false) {
  const result:any[]=[];
  for (const item of items) {
    const listing=await record(item.id);
    if (!authorCopies&&(listing.kind!=='Catalogue'||listing.status!=='Published')) throw Error('Choose a published bookstore listing');
    const book=authorCopies?listing:await record(listing.data.bookReference);
    const d=book.data;
    if (book.kind!=='Publishing'||!['In production','Ready to ship','Dispatched','Delivered','Completed','Published'].includes(book.status)||!d.isbn||!d.proofAccepted||d.proofISBN!==d.isbn) throw Error('Edition final proof and ISBN are not ready for printing');
    // The ordered edition decides the binding: bookstore listing, else the explicit author-copy choice, else the book's own binding.
    const binding=printBinding(authorCopies?(item.binding||d.binding):(listing.data.binding||d.binding));
    if (authorCopies&&!(d.formats||[d.binding]).includes(binding)) throw Error('This book is not published in the requested binding');
    const config=printConfig(d.printingConfig,d.pageCount);
    // The price-size mapping is explicitly staff approved; the physical trim stays visible too.
    const files:any={};
    for (const [kind,key] of [['Files','interior'],['Cover design','cover']]) {
      const candidates=[];
      for (const f of d.proofFiles||[]) {
        const row=await record(f.id);
        if(row.kind===kind&&row.owner===book.owner&&row.status==='Approved'&&row.version===f.version&&row.data.bookReference===book.id&&row.data.fileKey&&!row.data.reviewProof&&row.data.fileType==='application/pdf') candidates.push(row);
      }
      const chosen=candidates.find(r=>r.id===d[key==='interior'?'interiorFileId':'coverFileId'])||(candidates.length===1?candidates[0]:null);
      if(!chosen)throw Error('The exact author-approved interior and final cover PDFs are required');
      files[key]={id:chosen.id,version:chosen.version,key:chosen.data.fileKey,filename:chosen.data.filename||key+'.pdf'};
    }
    const cost=printCost(config,item.qty,binding);
    result.push({listingId:item.id,bookId:book.id,title:d.title,isbn:d.isbn,editionVersion:book.version,trimSize:d.trimSize,binding,copies:item.qty,config,cost,files});
  }
  return result;
}
export async function markPrintPaid(order:any,data:any) {
  if(!await db().prepare('SELECT order_id FROM printing_snapshots WHERE order_id=?').bind(order.id).first()) throw Error('This order has no locked print files. Staff must review it before recording payment.');
  // Compare-and-swap payment and its durable outbox entry in one transaction.
  const queries=[update(order,'Paid',data),db().prepare("INSERT OR IGNORE INTO printing_jobs(order_id,state,updated) SELECT ?,'Queued',? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND status='Paid')").bind(order.id,now(),order.id)];
  const results=await db().batch(queries);
  if(!results[0].meta.changes)throw Error('Order changed; refresh and retry payment verification');
}
export async function printRequest(method:string,path:string,body='') {
  const secret=secrets().PRINTING_SECRET;
  if(!printingEnabled()||!secret||secret.length<32)throw Error('Printing connector is not activated');
  // Fixed destinations prevent a misconfigured URL leaking the shared credential or files.
  const fullPath='/wp-json/openshelf/v1'+path;
  const response=await fetch('https://onlineprintingz.in'+fullPath,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{...await signedHeaders(secret,method,fullPath,body),'Content-Type':'application/json'},...(method==='POST'?{body}:{})});
  if(!response.ok){const error:any=Error('Printer returned HTTP '+response.status+'; staff review may be required');error.httpStatus=response.status;throw error;}
  return response.json() as Promise<any>;
}
export async function printJob(id:string){return db().prepare('SELECT * FROM printing_jobs WHERE order_id=?').bind(id).first<any>()}
export async function transferPrintJob(id:string) {
  if(!printingEnabled())return {disabled:true};
  const order=await record(id);
  if(order.kind!=='Orders'||order.status!=='Paid')throw Error('Only verified paid orders may be transferred');
  const token=crypto.randomUUID(),time=Date.now();
  const lock=await db().prepare("UPDATE printing_jobs SET lease_until=?,lease_token=?,state='Sending',attempts=attempts+1,updated=? WHERE order_id=? AND state IN ('Queued','Retry','Sending') AND lease_until<? AND next_attempt<=?").bind(time+60000,token,now(),id,time,time).run();
  if(!lock.meta.changes)return {busyOrTransferred:true};
  try {
    const refund=await db().prepare("SELECT id FROM records WHERE kind='Refunds' AND json_extract(data,'$.orderId')=? AND status!='Rejected' LIMIT 1").bind(id).first();
    if(refund)throw Error('A refund/return request needs staff reconciliation before printing');
    if(order.kind!=='Orders'||order.status!=='Paid')throw Error('Only verified paid orders may be transferred');
    if(order.data.carrierShipmentId)throw Error('A courier shipment already exists; reconcile before delegating dispatch');
    const snapshot=await db().prepare('SELECT payload FROM printing_snapshots WHERE order_id=?').bind(id).first<any>();
    if(!snapshot)throw Error('Locked print snapshot is missing');
    const items=JSON.parse(snapshot.payload);
    for(const item of items)for(const file of Object.values(item.files) as any[])if(!await secrets().BUCKET.head(file.key))throw Error('An approved print PDF is missing from storage');
    const publicItems=items.map(({files,...item}:any,index:number)=>({...item,index,productId:printProducts[printBinding(item.binding||'Paperback')],binding:printBinding(item.binding||'Paperback'),files:{interior:{version:files.interior.version,filename:files.interior.filename},cover:{version:files.cover.version,filename:files.cover.filename}}}));
    const payload={schema:1,sourceOrder:id,delivery:printAddress(order.data),items:publicItems,mode:'hold',currency:'INR'};
    const body=JSON.stringify(payload),payloadHash=await digest(body);
    const remote=await printRequest('POST','/orders',body);
    if(!Number.isSafeInteger(remote.id)||remote.id<=0||remote.sourceOrder!==id||remote.payloadHash!==payloadHash)throw Error('Printer response did not match the transferred order');
    await db().prepare("UPDATE printing_jobs SET state='Transferred',remote_id=?,last_error='',lease_until=0,updated=? WHERE order_id=? AND lease_token=?").bind(remote.id,now(),id,token).run();
    const fresh=await record(id);
    await db().prepare("UPDATE records SET data=json_set(data,'$.printingOrderId',?,'$.printingStage','Awaiting approval'),version=version+1,updated=? WHERE id=?").bind(remote.id,now(),id).run();
    await audit(fresh.id,'OnlinePrintingz','Transferred approved print snapshot; awaiting printer approval');
    return {ok:true,remoteId:remote.id};
  } catch(e) {
    const job=await printJob(id),attempts=job?.attempts||1;
    await db().prepare("UPDATE printing_jobs SET state=?,next_attempt=?,lease_until=0,last_error=?,updated=? WHERE order_id=? AND lease_token=?").bind(attempts>=8||([400,401,403,404,409,422].includes((e as any).httpStatus))?'Review':'Retry',Date.now()+Math.min(3600000,30000*2**attempts),String((e as Error).message).slice(0,300),now(),id,token).run();
    throw e;
  }
}
export async function syncPrintJob(id:string) {
  const job=await printJob(id);
  if(!job?.remote_id)throw Error('Transfer the print order first');
  const incoming=await printRequest('GET','/orders/'+job.remote_id);
  if(incoming.sourceOrder!==id||incoming.id!==job.remote_id||!Number.isSafeInteger(incoming.revision)||incoming.revision<1)throw Error('Printer update does not match this order');
  if(incoming.revision<=job.remote_revision){await db().prepare('UPDATE printing_jobs SET last_error=\'\',updated=? WHERE order_id=?').bind(now(),id).run();return {unchanged:true};}
  const r=await record(id),stage=nextPrintStage(r.data.printingStage||'Awaiting approval',incoming.stage,incoming);
  if(!['Paid','In production','Ready to ship','Dispatched','Delivered'].includes(r.status))throw Error('Order requires manual reconciliation');
  const data={...r.data,printingOrderId:job.remote_id,printingStage:stage,printingCheckedAt:now(),printingSyncToken:crypto.randomUUID(),...(incoming.tracking?{carrier:String(incoming.carrier).slice(0,100),tracking:String(incoming.tracking).slice(0,200),trackingURL:/^https:\/\//.test(incoming.trackingURL||'')?String(incoming.trackingURL).slice(0,1000):''}:{})};
  const status=stage==='Awaiting approval'?r.status:stage;
  // Do not let a delayed poll rewind a local stage; use the current row version.
  const orderStages=['Paid','In production','Ready to ship','Dispatched','Delivered'];
  const next=orderStages.indexOf(status)<orderStages.indexOf(r.status)?r.status:status;
  const updated=now();
  const notificationId='print-notice-'+id+'-'+incoming.revision;
  const notice={title:'Printing update: '+r.data.title,message:stage+(incoming.tracking?' · '+incoming.carrier+': '+incoming.tracking:''),recordId:id,email:r.data.contactEmail||r.data.email||''};
  const notification=db().prepare("INSERT OR IGNORE INTO records SELECT ?,?,'Notifications','Unsent',?,?,?,1 WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.printingSyncToken')=?)").bind(notificationId,r.owner,JSON.stringify(notice),updated,updated,id,data.printingSyncToken);
  const results=await db().batch([update(r,next,data),notification,db().prepare('UPDATE printing_jobs SET remote_revision=?,updated=? WHERE order_id=? AND remote_revision<? AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,\'$.printingSyncToken\')=?)').bind(incoming.revision,updated,id,incoming.revision,id,data.printingSyncToken)]);
  if(!results[0].meta.changes)throw Error('Order changed during sync; retry');
  if(stage!==r.data.printingStage)await audit(id,'OnlinePrintingz','Printing update: '+stage);
  return {ok:true,stage};
}
export async function runPrintQueue(limit=10) {
  if(!printingEnabled())return {disabled:true};
  await db().prepare("INSERT OR IGNORE INTO printing_jobs(order_id,state,updated) SELECT r.id,'Queued',? FROM records r JOIN printing_snapshots s ON s.order_id=r.id WHERE r.kind='Orders' AND r.status='Paid'").bind(now()).run();
  const rows=(await db().prepare("SELECT order_id FROM printing_jobs WHERE state IN ('Queued','Retry','Sending') AND next_attempt<=? AND lease_until<? ORDER BY updated LIMIT ?").bind(Date.now(),Date.now(),limit).all<any>()).results;
  for(const row of rows)try{await transferPrintJob(row.order_id)}catch{/* persisted in the review queue */}
  const active=(await db().prepare("SELECT order_id FROM printing_jobs WHERE state='Transferred' ORDER BY updated LIMIT ?").bind(limit).all<any>()).results;
  for(const row of active)try{await syncPrintJob(row.order_id)}catch(e){await db().prepare('UPDATE printing_jobs SET last_error=?,updated=? WHERE order_id=?').bind(String((e as Error).message).slice(0,300),now(),row.order_id).run()}
  if(emailReady(secrets())){const notices=(await db().prepare("SELECT id FROM records WHERE kind='Notifications' AND status IN ('Unsent','Failed') AND id LIKE 'print-notice-%' ORDER BY created LIMIT 10").all<any>()).results;for(const n of notices)try{const {sendNotification}=await import('./providers');await sendNotification(await record(n.id))}catch{/* existing notification queue keeps failures visible */}}
  return {attempted:rows.length,synced:active.length};
}
export async function retryPrintJob(id:string,u:any) {
  staff(u);const r=await record(id);if(r.kind!=='Orders'||r.status!=='Paid')throw Error('Review a paid order');
  const job=await printJob(id);if(!job||job.remote_id)throw Error('This job is not awaiting transfer');
  await db().prepare("UPDATE printing_jobs SET state='Queued',attempts=0,next_attempt=0,last_error='' WHERE order_id=? AND lease_until<?").bind(id,Date.now()).run();
  await audit(id,u.email,'Staff requested a print-transfer retry');
  return transferPrintJob(id);
}
