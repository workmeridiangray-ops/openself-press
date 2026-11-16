/* eslint-disable @typescript-eslint/no-explicit-any -- Validated supplier/provider data at private finance boundaries. */
import {db,secrets,record,audit,settings,update,notify} from './server';
import {supplierCharge,money,cutoff,closedSettlementDay,paidOrderStates,payoutTransition,safeCSV} from './settlement-contract';
import {digest} from './printing-contract';
import {providerBridge} from './provider-bridge';

const now=()=>new Date().toISOString();
const one=(sql:string,...args:any[])=>db().prepare(sql).bind(...args).first<any>();
const rows=async(sql:string,...args:any[])=>(await db().prepare(sql).bind(...args).all<any>()).results;
const execute=(sql:string,...args:any[])=>db().prepare(sql).bind(...args).run();
export const financeSchema=()=>secrets().SETTLEMENT_SCHEMA==='1';
async function lock<T>(id:string,fn:()=>Promise<T>){
  const token=crypto.randomUUID();const claimed=await execute('INSERT INTO finance_locks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE finance_locks.expires<?',id,token,Date.now()+300000,Date.now());
  if(!claimed.meta.changes)throw Error('This financial operation is already running; refresh before retrying');
  try{return await fn()}finally{await execute('DELETE FROM finance_locks WHERE id=? AND token=?',id,token)}
}
async function blocked(orderId:string){return !!await one("SELECT id FROM records WHERE kind='Refunds' AND json_extract(data,'$.orderId')=? AND status!='Rejected' AND COALESCE(json_extract(data,'$.supplierLiabilityConfirmed'),0)!=1 LIMIT 1",orderId)}
function realPaidOrder(order:any){if(order.kind!=='Orders'||!paidOrderStates.includes(order.status)||!order.data.paidAt||!order.data.paymentId||order.data.testMode||/\btest\b/i.test(order.data.title||''))throw Error('A real verified paid customer order is required');if(order.data.paymentEnvironment!==(secrets().FINANCE_MODE||'test'))throw Error('Verify the captured payment environment before supplier settlement')}
export async function ingestSupplierCharge(order:any,incoming:any){
  if(!financeSchema()||!incoming.charge)return;
  realPaidOrder(order);
  if(incoming.id!==order.data.printingOrderId||incoming.sourceOrder!==order.id)throw Error('Supplier charge order mismatch');
  const quote={...supplierCharge(incoming.charge),environment:order.data.paymentEnvironment},current=await one('SELECT * FROM printer_charges WHERE order_id=?',order.id);
  if(current&&quote.revision<current.revision)return;
  if(current&&quote.revision===current.revision){const prior=JSON.parse(current.payload);if(['invoice','productionPaise','shippingPaise','taxPaise','discountPaise','confirmedAt','environment'].some(k=>(prior as any)[k]!==((quote as any)[k])))throw Error('Supplier changed an invoice without incrementing its revision');return;}
  if(current?.batch_id){await execute("UPDATE printer_charges SET last_error='Supplier changed an already batched invoice; reconcile a credit or supplementary invoice',updated=? WHERE order_id=?",now(),order.id);return;}
  const state=await blocked(order.id)?'Held':'Review';
  await execute("INSERT INTO printer_charges(order_id,remote_id,revision,invoice,payload,amount_paise,state,confirmed_at,updated) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET revision=excluded.revision,invoice=excluded.invoice,payload=excluded.payload,amount_paise=excluded.amount_paise,state=excluded.state,confirmed_at=excluded.confirmed_at,approved_by=NULL,approved_at=NULL,last_error='',updated=excluded.updated WHERE printer_charges.batch_id IS NULL AND printer_charges.revision<excluded.revision",order.id,incoming.id,quote.revision,quote.invoice,JSON.stringify(quote),quote.amountPaise,state,quote.confirmedAt,now());
  await execute("UPDATE records SET status='Resolved',updated=?,version=version+1 WHERE id=? AND kind='Finance alerts'",now(),'finance-alert-'+order.id);
}
export async function flagFinanceAlert(orderId:string,message:string){
  await execute("INSERT INTO records VALUES(?,'system','Finance alerts','Open',?,?,?,1) ON CONFLICT(id) DO UPDATE SET status='Open',data=excluded.data,updated=excluded.updated,version=version+1",'finance-alert-'+orderId,JSON.stringify({title:'Supplier invoice requires review',orderId,message:message.slice(0,400)}),now(),now());
  await execute('UPDATE printer_charges SET last_error=?,updated=? WHERE order_id=?',message.slice(0,300),now(),orderId);
}
export async function approveSupplierCharge(id:string,revision:number,actor:string){
  return lock('charge-'+id,async()=>{
    const order=await record(id);realPaidOrder(order);
    const c=await one('SELECT * FROM printer_charges WHERE order_id=?',id);
    if(!c||c.revision!==revision||c.batch_id||c.last_error||await blocked(id))throw Error('Refresh and resolve the order/refund before approving its exact invoice revision');
    const snapshot=await one('SELECT payload FROM printing_snapshots WHERE order_id=?',id);
    if(!snapshot||JSON.parse(snapshot.payload).some((item:any)=>item.isbn==='9780000000002'||/\btest\b/i.test(item.title||'')))throw Error('Test or unverified print snapshots cannot enter a real settlement');
    const result=await execute("UPDATE printer_charges SET state='Approved',approved_by=?,approved_at=?,updated=? WHERE order_id=? AND revision=? AND batch_id IS NULL",actor,now(),now(),id,revision);
    if(!result.meta.changes)throw Error('Supplier charge changed; refresh');
    await audit(id,actor,'Approved supplier invoice '+c.invoice+' for INR '+(c.amount_paise/100).toFixed(2));
    return {ok:true};
  });
}
export async function financePolicy(){try{return (await record('printer-settlement-policy')).data}catch{return {automatic:false,dailyLimitPaise:1000000,termsAccepted:false,timezone:'Asia/Kolkata'}}}
export async function saveFinancePolicy(input:any,actor:string){
  const limit=money(input.dailyLimitPaise,'Daily payout ceiling');if(limit<100)throw Error('Set a positive payout ceiling');
  if(input.automatic&&!input.termsAccepted)throw Error('Accept the supplier payment terms before automatic submission');
  const value={automatic:input.automatic===true,dailyLimitPaise:limit,termsAccepted:input.termsAccepted===true,timezone:'Asia/Kolkata',updatedBy:actor};
  await execute("INSERT INTO records VALUES('printer-settlement-policy','system','Configuration','Configured',?,?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=version+1,updated=excluded.updated",JSON.stringify(value),now(),now());
  await audit('printer-settlement-policy',actor,'Updated supplier settlement policy');return value;
}
export async function financeReadiness(checkRelay=false){
  const e=secrets(),policy=await financePolicy(),business=await settings();const missing:string[]=[];
  if(!financeSchema())missing.push('Apply migration 0004 and set SETTLEMENT_SCHEMA=1');
  if(!e.PROVIDER_RELAY_URL||!e.PROVIDER_RELAY_SECRET)missing.push('Configure the fixed-egress provider relay');
  if(!e.PRINTING_SECRET||e.PRINTING_SECRET.length<32)missing.push('Configure the shared printing connection secret');
  if(!e.RAZORPAY_KEY_ID||!e.RAZORPAY_KEY_SECRET)missing.push('Configure the matching checkout key ID and signature secret');
  if(!e.RAZORPAY_WEBHOOK_SECRET)missing.push('Configure payment webhook validation');
  if(!e.RAZORPAYX_WEBHOOK_SECRET)missing.push('Configure payout webhook validation');
  if(!business.businessName||!business.address||!business.contactEmail)missing.push('Complete legal seller/invoice details');
  if(!business.launchReady||['privacy','terms','shipping','returns'].some(k=>!business.policies?.[k]))missing.push('Approve the seller policies and mark business settings launch-ready');
  if(!policy.termsAccepted)missing.push('Approve supplier settlement terms');
  let relay:any=null;
  if(checkRelay&&e.PROVIDER_RELAY_URL&&e.PROVIDER_RELAY_SECRET){try{relay=await providerBridge('GET','/health');if(!relay.ready||!relay.allowlistConfirmed||!relay.activationConfirmed)missing.push('Provider activation, beneficiary or IP allowlisting is incomplete');if(relay.mode!==(e.FINANCE_MODE||'test'))missing.push('Worker and provider relay environments do not match');if(relay.keyId!==e.RAZORPAY_KEY_ID)missing.push('Worker checkout key and relay provider key do not match')}catch{missing.push('Provider relay health check failed')}}
  if(checkRelay&&e.PRINTING_SECRET){try{const {printRequest}=await import('./printing');const caps=await printRequest('GET','/capabilities');if(caps.version<3||caps.supplierSettlements!==true)missing.push('Update the WordPress connector to 0.3.0')}catch{missing.push('Printer capabilities/shared-secret check failed')}}
  return {schema:financeSchema(),enabled:e.PAYOUTS_ENABLED==='1',mode:e.FINANCE_MODE||'test',policy,relay,missing,ready:missing.length===0&&!!relay?.ready};
}
export async function prepareDailyBatch(day=closedSettlementDay()||'',actor='Scheduled settlement'){
  if(!financeSchema())throw Error('Supplier settlement migration is not activated');
  if(!day||day>String(closedSettlementDay()||''))throw Error('Wait until the settlement day has closed at 00:15 IST');
  return lock('daily-batch',async()=>{
    const mode=secrets().FINANCE_MODE||'test';if(!['test','live'].includes(mode))throw Error('Choose test or live finance mode');
    const dayKey=mode+':'+day,prior=await one('SELECT * FROM printer_batches WHERE day=?',dayKey);if(prior)return prior;
    const end=cutoff(day);
    const candidates=await rows("SELECT c.* FROM printer_charges c JOIN records r ON r.id=c.order_id WHERE c.state='Approved' AND c.batch_id IS NULL AND c.last_error='' AND c.confirmed_at<? AND c.approved_at<? AND json_extract(c.payload,'$.environment')=? AND json_extract(r.data,'$.paymentEnvironment')=? AND r.status IN ('Paid','In production','Ready to ship','Dispatched','Delivered') AND NOT EXISTS(SELECT 1 FROM records f WHERE f.kind='Refunds' AND json_extract(f.data,'$.orderId')=c.order_id AND f.status!='Rejected' AND COALESCE(json_extract(f.data,'$.supplierLiabilityConfirmed'),0)!=1) ORDER BY c.order_id",end,end,mode,mode);
    if(!candidates.length)return {empty:true,day};
    const gross=candidates.reduce((sum:number,c:any)=>sum+c.amount_paise,0);money(gross,'Batch total');
    // Whole credit notes are reserved once. Notes exceeding this batch carry forward.
    const credits:any[]=[];let total=gross;
    for(const credit of await rows("SELECT x.* FROM printer_credits x JOIN printer_charges c ON c.order_id=x.order_id WHERE x.state='Approved' AND x.batch_id IS NULL AND x.created<? AND json_extract(c.payload,'$.environment')=? ORDER BY x.created,x.id",end,mode))if(total-credit.amount_paise>=100){credits.push(credit);total-=credit.amount_paise;}
    const id='ps-'+mode+'-'+day,manifest={schema:1,supplier:'OnlinePrintingz',day,environment:mode,currency:'INR',items:candidates.map((c:any)=>({orderId:c.order_id,remoteId:c.remote_id,invoice:c.invoice,revision:c.revision,amountPaise:c.amount_paise,charge:JSON.parse(c.payload)})),credits:credits.map(c=>({id:c.id,reference:c.reference,orderId:c.order_id,amountPaise:c.amount_paise})),grossPaise:gross,totalPaise:total};
    // Guard statements fail the entire transaction on a stale selection, never reserve a partial manifest.
    const itemJSON=JSON.stringify(manifest.items),creditJSON=JSON.stringify(manifest.credits);
    const guard="NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN printer_charges c ON c.order_id=json_extract(j.value,'$.orderId') LEFT JOIN records r ON r.id=c.order_id WHERE c.order_id IS NULL OR c.revision!=json_extract(j.value,'$.revision') OR c.amount_paise!=json_extract(j.value,'$.amountPaise') OR c.state!='Approved' OR c.batch_id IS NOT NULL OR c.last_error!='' OR json_extract(r.data,'$.paymentEnvironment') IS NOT json_extract(j.value,'$.charge.environment') OR r.status NOT IN ('Paid','In production','Ready to ship','Dispatched','Delivered') OR EXISTS(SELECT 1 FROM records f WHERE f.kind='Refunds' AND json_extract(f.data,'$.orderId')=c.order_id AND f.status!='Rejected' AND COALESCE(json_extract(f.data,'$.supplierLiabilityConfirmed'),0)!=1)) AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN printer_credits c ON c.id=json_extract(j.value,'$.id') WHERE c.id IS NULL OR c.amount_paise!=json_extract(j.value,'$.amountPaise') OR c.state!='Approved' OR c.batch_id IS NOT NULL)";
    await db().batch([
      db().prepare("INSERT INTO printer_batches(id,day,manifest,amount_paise,state,created,updated) VALUES(?,?,?,?,CASE WHEN "+guard+" THEN 'Draft' ELSE NULL END,?,?)").bind(id,dayKey,JSON.stringify(manifest),total,itemJSON,creditJSON,now(),now()),
      db().prepare("INSERT INTO printer_batch_items SELECT json_extract(value,'$.orderId'),?,json_extract(value,'$.amountPaise'),json_extract(value,'$.invoice'),json_extract(value,'$.revision') FROM json_each(?)").bind(id,itemJSON),
      db().prepare("UPDATE printer_charges SET state='Batched',batch_id=?,updated=? WHERE order_id IN (SELECT json_extract(value,'$.orderId') FROM json_each(?))").bind(id,now(),itemJSON),
      db().prepare("UPDATE printer_credits SET state='Batched',batch_id=? WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(id,creditJSON)
    ]);
    await audit(id,actor,'Prepared daily supplier manifest with '+candidates.length+' independent customer orders');
    return one('SELECT * FROM printer_batches WHERE id=?',id);
  });
}
async function validateBatch(batch:any){
  const manifest=JSON.parse(batch.manifest),policy=await financePolicy();
  if(manifest.environment!==(secrets().FINANCE_MODE||'test'))throw Error('This remittance belongs to a different provider environment');
  if(!policy.termsAccepted||batch.amount_paise>policy.dailyLimitPaise)throw Error('Supplier terms or payout ceiling require review');
  for(const item of manifest.items){
    const c=await one('SELECT * FROM printer_charges WHERE order_id=?',item.orderId),order=await record(item.orderId);realPaidOrder(order);
    if(!c||c.batch_id!==batch.id||c.revision!==item.revision||c.amount_paise!==item.amountPaise||c.last_error||await blocked(item.orderId))throw Error('A batched order, invoice or refund needs reconciliation');
  }
  return manifest;
}
export async function approveDailyBatch(id:string,actor:string){return lock('batch-'+id,async()=>{
  const b=await one('SELECT * FROM printer_batches WHERE id=?',id);if(!b||b.state!=='Draft')throw Error('Choose a draft remittance');const manifest=await validateBatch(b);
  const readiness=await financeReadiness(true);if(!readiness.ready)throw Error(readiness.missing.join('; ')||'Complete provider setup before financial approval');
  manifest.approval={beneficiaryId:readiness.relay.beneficiaryId,environment:readiness.mode,relayOrigin:new URL(secrets().PROVIDER_RELAY_URL).origin};
  await execute("UPDATE printer_batches SET state='Approved',approved_by=?,manifest=?,updated=? WHERE id=? AND state='Draft'",actor,JSON.stringify(manifest),now(),id);await audit(id,actor,'Approved frozen daily supplier manifest and configured beneficiary');return {ok:true};
})}
export async function withdrawUnsentBatch(id:string,reason:string,actor:string){return lock('batch-'+id,async()=>{
  const batch=await one('SELECT * FROM printer_batches WHERE id=?',id);
  if(!batch||!['Draft','Approved'].includes(batch.state)||batch.attempt_id||await one('SELECT id FROM printer_attempts WHERE batch_id=? LIMIT 1',id)||!reason.trim())throw Error('Only an unsubmitted batch with no bank attempt may be withdrawn with a reason');
  await db().batch([
    db().prepare("UPDATE printer_batches SET state='Withdrawn',approved_by=NULL,updated=? WHERE id=? AND attempt_id IS NULL").bind(now(),id),
    db().prepare("DELETE FROM printer_batch_items WHERE batch_id=?").bind(id),
    db().prepare("UPDATE printer_charges SET state='Review',batch_id=NULL,approved_by=NULL,approved_at=NULL,updated=? WHERE batch_id=?").bind(now(),id),
    db().prepare("UPDATE printer_credits SET state='Approved',batch_id=NULL WHERE batch_id=?").bind(id)
  ]);
  await audit(id,actor,'Withdrew unsent manifest; re-review charges for a later day. '+reason.slice(0,500));return {ok:true};
})}
async function verifyPayout(entity:any,attempt:any,batch:any){
  attempt=await one('SELECT * FROM printer_attempts WHERE id=?',attempt.id);
  const active=await one('SELECT attempt_id FROM printer_batches WHERE id=?',batch.id);
  if(active?.attempt_id!==attempt.id)throw Error('A superseded payout attempt changed; reconcile all attempts before continuing');
  const request=JSON.parse(attempt.request);
  if(!/^pout_[A-Za-z0-9]+$/.test(entity.id||'')||entity.amount!==batch.amount_paise||entity.currency!=='INR'||entity.reference_id!==batch.id||entity.fund_account_id!==request.beneficiaryId||entity.environment!==request.environment)throw Error('Provider payout does not match the immutable manifest and beneficiary');
  if(attempt.provider_id&&entity.id!==attempt.provider_id)throw Error('Provider payout reference changed');
  const state=payoutTransition(attempt.state,entity.status),fee=money(entity.fees||0),tax=money(entity.tax||0);
  const changed=state!==attempt.state||entity.utr!==attempt.utr;
  await db().batch([
    db().prepare('UPDATE printer_attempts SET state=?,provider_id=?,utr=?,fee_paise=?,tax_paise=?,last_error=?,updated=? WHERE id=?').bind(state,entity.id,String(entity.utr||'').slice(0,100),fee,tax,String(entity.status_details?.reason||'').slice(0,200),now(),attempt.id),
    db().prepare('UPDATE printer_batches SET acknowledged=CASE WHEN state!=? THEN 0 ELSE acknowledged END,state=?,updated=? WHERE id=? AND attempt_id=?').bind(state==='processed'?'Settled':state==='reversed'?'Reversed':state,state==='processed'?'Settled':state==='reversed'?'Reversed':state,now(),batch.id,attempt.id),
    db().prepare("UPDATE printer_charges SET state=?,updated=? WHERE batch_id=?").bind(state==='processed'?'Settled':state==='reversed'?'Reversed':'Batched',now(),batch.id)
  ]);
  if(changed)await audit(batch.id,'RazorpayX','Provider-confirmed payout '+state+(entity.utr?' · '+entity.utr:''));
  return {ok:true,state,providerId:entity.id};
}
export async function submitDailyBatch(id:string,actor:string){return lock('batch-'+id,async()=>{
  if(secrets().PAYOUTS_ENABLED!=='1')throw Error('Payouts remain disabled until owner activation');
  const b=await one('SELECT * FROM printer_batches WHERE id=?',id);if(!b||!['Approved','Uncertain','Sending'].includes(b.state))throw Error('Approve this batch before payout');
  const manifest=await validateBatch(b);const readiness=await financeReadiness(true);if(!readiness.ready)throw Error(readiness.missing.join('; ')||'Complete provider setup');
  if(manifest.approval?.beneficiaryId!==readiness.relay.beneficiaryId||manifest.approval?.environment!==readiness.mode||manifest.approval?.relayOrigin!==new URL(secrets().PROVIDER_RELAY_URL).origin)throw Error('The approved beneficiary, environment or relay changed; review this remittance again');
  let attempt=b.attempt_id?await one('SELECT * FROM printer_attempts WHERE id=?',b.attempt_id):null;
  if(attempt?.provider_id)return verifyPayout(await providerBridge('GET','/payouts/'+attempt.provider_id),attempt,b);
  if(attempt&&Date.now()-Date.parse(attempt.created)>86400000)throw Error('Uncertain payout older than 24 hours needs provider reconciliation, not a fresh request');
  if(!attempt){
    const key=crypto.randomUUID(),body={amount:b.amount_paise,currency:'INR',reference_id:b.id,beneficiaryId:readiness.relay.beneficiaryId,environment:readiness.mode,manifestHash:await digest(b.manifest)};
    const claimed=await db().batch([db().prepare("INSERT INTO printer_attempts(id,batch_id,request,state,created,updated) SELECT ?,?,?,'Sending',?,? WHERE EXISTS(SELECT 1 FROM printer_batches WHERE id=? AND state='Approved' AND attempt_id IS NULL)").bind(key,id,JSON.stringify(body),now(),now(),id),db().prepare("UPDATE printer_batches SET state='Sending',attempt_id=?,updated=? WHERE id=? AND state='Approved' AND attempt_id IS NULL AND EXISTS(SELECT 1 FROM printer_attempts WHERE id=?)").bind(key,now(),id,key)]);
    if(!claimed[0].meta.changes||!claimed[1].meta.changes)throw Error('Another operation changed this batch; refresh before submitting');
    attempt=await one('SELECT * FROM printer_attempts WHERE id=?',key);
  }
  const request=JSON.parse(attempt.request);
  if(request.beneficiaryId!==readiness.relay.beneficiaryId||request.environment!==readiness.mode)throw Error('Beneficiary/environment changed after approval; reconcile the frozen attempt');
  await audit(id,actor,'Submitting persisted payout attempt '+attempt.id);
  await validateBatch(b); // Recheck refund and invoice holds after external readiness calls.
  try{return await verifyPayout(await providerBridge('POST','/payouts',request,attempt.id),attempt,{...b,attempt_id:attempt.id})}
  catch(e){await db().batch([db().prepare("UPDATE printer_attempts SET state='Uncertain',last_error=?,updated=? WHERE id=? AND provider_id IS NULL").bind(String((e as Error).message).slice(0,300),now(),attempt.id),db().prepare("UPDATE printer_batches SET state='Uncertain',updated=? WHERE id=? AND attempt_id=? AND state='Sending'").bind(now(),id,attempt.id)]);throw e}
})}
export async function reconcilePayout(id:string){return lock('batch-'+id,async()=>{
  const b=await one('SELECT * FROM printer_batches WHERE id=?',id),a=b?.attempt_id?await one('SELECT * FROM printer_attempts WHERE id=?',b.attempt_id):null;
  if(!a?.provider_id)throw Error('No provider reference yet; retry the same uncertain submission');
  return verifyPayout(await providerBridge('GET','/payouts/'+a.provider_id),a,b);
})}
export async function resetFailedPayout(id:string,actor:string){return lock('batch-'+id,async()=>{
  const b=await one('SELECT * FROM printer_batches WHERE id=?',id),a=b?.attempt_id?await one('SELECT * FROM printer_attempts WHERE id=?',b.attempt_id):null;
  if(!a?.provider_id)throw Error('Resolve the existing provider attempt first');
  await verifyPayout(await providerBridge('GET','/payouts/'+a.provider_id),a,b);
  const fresh=await one('SELECT state FROM printer_attempts WHERE id=?',a.id);
  if(!['failed','rejected','cancelled','reversed'].includes(fresh.state))throw Error('The provider has not confirmed a terminal failed/reversed payout');
  await execute("UPDATE printer_batches SET state='Draft',attempt_id=NULL,approved_by=NULL,acknowledged=0,updated=? WHERE id=?",now(),id);await audit(id,actor,'Reopened provider-confirmed failed/reversed batch for fresh approval');return {ok:true};
})}
export async function addSupplierCredit(input:any,actor:string){return lock('supplier-credit',async()=>{
  const charge=await one('SELECT * FROM printer_charges WHERE order_id=?',input.orderId);if(!charge||charge.state!=='Settled')throw Error('Link a credit to a settled supplier invoice');
  if(JSON.parse(charge.payload).environment!==(secrets().FINANCE_MODE||'test'))throw Error('Supplier credit belongs to a different provider environment');
  const amount=money(input.amountPaise),used=await one('SELECT COALESCE(SUM(amount_paise),0) AS total FROM printer_credits WHERE order_id=?',input.orderId);
  if(amount<1||amount+used.total>charge.amount_paise||!String(input.reference||'').trim()||!String(input.reason||'').trim())throw Error('Confirm the supplier credit reference, reason and amount within the original invoice');
  const evidence=await record(input.evidenceId);if(!evidence.data.fileKey&&!evidence.data.receiptKey)throw Error('Upload supplier credit evidence first');
  await execute("INSERT INTO printer_credits VALUES(?,?,?,?, 'Approved',NULL,?,?,?)",crypto.randomUUID(),String(input.reference).slice(0,100),input.orderId,amount,String(input.reason).slice(0,1000)+' · evidence '+evidence.id,actor,now());await audit(input.orderId,actor,'Approved supplier credit note '+input.reference);return {ok:true};
})}
export async function voidCancelledCharge(id:string,reason:string,actor:string){
  const order=await record(id);if(!order.data.printerCancellationConfirmed||!reason.trim())throw Error('Obtain printer cancellation confirmation and record the agreed zero-charge responsibility first');
  const result=await execute("UPDATE printer_charges SET state='Voided',last_error=?,approved_by=?,updated=? WHERE order_id=? AND batch_id IS NULL",'Agreed void after cancellation: '+reason.slice(0,200),actor,now(),id);
  if(!result.meta.changes)throw Error('A batched/settled invoice needs a credit note, not a void');await audit(id,actor,'Voided cancelled supplier invoice; '+reason.slice(0,500));return {ok:true};
}
export async function resolveSupplierHold(orderId:string,reason:string,actor:string){
  if(!reason.trim())throw Error('Record why this supplier invoice remains payable despite the customer refund/dispute');
  const refunds=await rows("SELECT * FROM records WHERE kind='Refunds' AND json_extract(data,'$.orderId')=? AND status!='Rejected'",orderId);
  if(!refunds.length)throw Error('No supplier liability hold found');
  await db().batch(refunds.map((r:any)=>db().prepare("UPDATE records SET data=json_set(data,'$.supplierLiabilityConfirmed',1,'$.supplierLiabilityReason',?,'$.supplierLiabilityApprovedBy',?),version=version+1,updated=? WHERE id=? AND version=?").bind(reason.slice(0,1000),actor,now(),r.id,r.version)));
  await execute("UPDATE printer_charges SET state='Review',approved_by=NULL,approved_at=NULL,updated=? WHERE order_id=? AND batch_id IS NULL",now(),orderId);
  await audit(orderId,actor,'Confirmed separate supplier liability: '+reason.slice(0,500));return {ok:true};
}
export async function cancelPrinterJob(orderId:string,actor:string){
  const order=await record(orderId);if(!order.data.printingOrderId||!await blocked(orderId))throw Error('Choose a delegated order with an unresolved cancellation/refund');
  const {printRequest}=await import('./printing');
  const result=await printRequest('POST','/orders/'+order.data.printingOrderId+'/cancel',JSON.stringify({sourceOrder:orderId}));
  if(result.sourceOrder!==orderId||result.cancelled!==true)throw Error('Printer did not confirm cancellation');
  await db().batch([db().prepare("UPDATE printing_jobs SET state='Cancelled',updated=? WHERE order_id=?").bind(now(),orderId),db().prepare("UPDATE records SET data=json_set(data,'$.printingStage','Cancelled','$.printerCancellationConfirmed',1),version=version+1,updated=? WHERE id=?").bind(now(),orderId),db().prepare("UPDATE printer_charges SET state='Held',last_error='Printer cancelled before release; reconcile cancellation invoice/credit before payment',updated=? WHERE order_id=? AND batch_id IS NULL").bind(now(),orderId)]);
  await audit(orderId,actor,'Printer confirmed cancellation before physical release; customer refund remains separate');return {ok:true};
}
export async function acknowledgeBatch(id:string){
  const b=await one("SELECT * FROM printer_batches WHERE id=? AND state IN ('Settled','Reversed')",id);if(!b||b.acknowledged===1)return {unchanged:true};
  const a=await one("SELECT * FROM printer_attempts WHERE id=? AND state IN ('processed','reversed')",b.attempt_id);if(!a)throw Error('Only provider-confirmed settlement/reversal can be acknowledged');
  const {printRequest}=await import('./printing');
  const manifest=JSON.parse(b.manifest),cursor=b.acknowledged<0?-b.acknowledged:0,items=manifest.items.slice(cursor,cursor+20),chunk=JSON.stringify({...manifest,items});
  const result=await printRequest('POST','/settlements',JSON.stringify({batchId:b.id,manifestHash:await digest(b.manifest),manifestJSON:chunk,chunkHash:await digest(chunk),cursor,totalItems:manifest.items.length,state:b.state==='Settled'?'settled':'reversed',providerId:a.provider_id,utr:a.utr,amountPaise:b.amount_paise}));
  if(result.batchId!==id||result.accepted!==true||result.cursor!==cursor)throw Error('Printer remittance acknowledgement requires reconciliation');
  const next=cursor+items.length;
  await execute('UPDATE printer_batches SET acknowledged=?,updated=? WHERE id=? AND attempt_id=? AND state=? AND acknowledged=?',next>=manifest.items.length?1:-next,now(),id,b.attempt_id,b.state,b.acknowledged);return {ok:true,complete:next>=manifest.items.length};
}
export async function payoutWebhook(eventId:string,entityId:string,event:string,reference?:string){
  if(!/^pout_[A-Za-z0-9]+$/.test(entityId)||eventId.length>200)throw Error('Invalid payout event');
  let a=await one('SELECT * FROM printer_attempts WHERE provider_id=?',entityId);
  if(!a&&/^ps-(test|live)-\d{4}-\d{2}-\d{2}$/.test(reference||''))a=await one('SELECT a.* FROM printer_attempts a JOIN printer_batches b ON b.attempt_id=a.id WHERE b.id=? AND a.provider_id IS NULL',reference);
  if(!a)return {ignored:true};
  if(await one('SELECT id FROM finance_events WHERE id=?',eventId))return {duplicate:true};
  const b=await one('SELECT * FROM printer_batches WHERE id=?',a.batch_id);
  // Fetch canonical state; signed but stale webhook payloads never determine the balance.
  await lock('batch-'+b.id,async()=>verifyPayout(await providerBridge('GET','/payouts/'+entityId),a,b));
  await execute('INSERT OR IGNORE INTO finance_events VALUES(?,?,?,?)',eventId,entityId,event,now());return {ok:true};
}
async function confirmRefund(entity:any,refund:any){
  const request=JSON.parse(refund.request);
  if(!/^rfnd_[A-Za-z0-9]+$/.test(entity.id||'')||entity.currency!=='INR'||entity.environment!==request.environment||request.environment!==(secrets().FINANCE_MODE||'test')||entity.payment_id!==refund.payment_id||entity.amount!==refund.amount_paise||(entity.receipt||'')!==request.body.receipt||(!request.external&&entity.notes?.refundCaseId!==refund.id)||!['pending','created','processed','failed'].includes(entity.status))throw Error('Provider refund does not match the approved payment and amount');
  if(refund.provider_id&&refund.provider_id!==entity.id)throw Error('Refund provider reference changed');
  if(refund.state==='processed')return {ok:true,state:'processed'};
  const firstProcessed=entity.status==='processed';
  await db().batch([
    db().prepare('UPDATE payment_refunds SET state=?,provider_id=?,last_error=?,updated=? WHERE id=?').bind(entity.status,entity.id,entity.status==='failed'?'Provider confirmed refund failure':'',now(),refund.id),
    ...(firstProcessed?[db().prepare("UPDATE records SET status='Refunded',data=json_set(data,'$.refundId',?,'$.refundedAt',?),version=version+1,updated=? WHERE id=? AND kind='Refunds'").bind(entity.id,now(),now(),refund.id),db().prepare("UPDATE records SET data=json_set(data,?,COALESCE(json_extract(data,?),0)+?),version=version+1,updated=? WHERE id=? AND kind='Orders'").bind(request.recovery?'$.recoveredExtraPaise':'$.refundedPaise',request.recovery?'$.recoveredExtraPaise':'$.refundedPaise',refund.amount_paise,now(),refund.order_id),...(request.recovery?[db().prepare("UPDATE records SET status='Resolved',updated=?,version=version+1 WHERE id=? AND kind='Payment recovery'").bind(now(),request.recovery)]:[])]:[])
  ]);
  if(firstProcessed){
    const order=await record(refund.order_id),noticeId='finance-notice-refund-'+refund.id;
    if(request.recovery)await execute("UPDATE records SET data=json_set(data,'$.paymentRecoveryPending',CASE WHEN EXISTS(SELECT 1 FROM records p WHERE p.kind='Payment recovery' AND p.status='Needs review' AND json_extract(p.data,'$.orderId')=?) THEN 1 ELSE 0 END),version=version+1,updated=? WHERE id=?",order.id,now(),order.id);
    await execute("INSERT OR IGNORE INTO records VALUES(?,?,'Notifications','Unsent',?,?,?,1)",noticeId,order.owner,JSON.stringify({title:'Refund confirmed: '+order.data.title,message:'Refund ₹'+(refund.amount_paise/100).toFixed(2)+' was confirmed by the payment provider. Reference: '+entity.id,recordId:order.id,email:order.data.contactEmail||order.data.email||''}),now(),now());
    await audit(refund.id,'Razorpay','Customer refund confirmed '+entity.id);
  }
  return {ok:true,state:entity.status};
}
export async function executeCustomerRefund(id:string,actor:string){
  if(!financeSchema()||secrets().REFUNDS_ENABLED!=='1')throw Error('Provider refunds remain disabled until owner activation');
  const request=await record(id);if(request.kind!=='Refunds'||!['Approved','Refunded'].includes(request.status))throw Error('Approve the customer refund and its amount first');
  const order=await record(request.data.orderId);
  const recovery=request.data.recoveryId?await record(request.data.recoveryId):null;
  if(recovery&&(recovery.kind!=='Payment recovery'||recovery.data.orderId!==order.id))throw Error('Invalid captured-payment recovery case');
  const paymentId=recovery?.data.paymentId||order.data.paymentId;
  if((!recovery&&order.data.paymentMethod!=='Razorpay captured')||!/^pay_[A-Za-z0-9]+$/.test(paymentId||''))throw Error('External receipts require an external refund and evidence; no Razorpay refund is available');
  return lock('refund-'+paymentId,async()=>{
    let refund=await one('SELECT * FROM payment_refunds WHERE id=?',id);
    if(refund?.provider_id)return confirmRefund(await providerBridge('GET','/refunds/'+refund.provider_id),refund);
    if(refund?.state==='Uncertain'&&Date.now()-Date.parse(refund.created)>86400000)throw Error('Reconcile the old uncertain refund before any further submission');
    if(!refund){
      const payment=await providerBridge('GET','/payments/'+paymentId);
      if(payment.environment!==(secrets().FINANCE_MODE||'test')||payment.id!==paymentId||payment.order_id!==order.data.providerOrder||payment.currency!=='INR'||payment.amount!==Math.round(order.data.total*100)||!['captured','refunded'].includes(payment.status))throw Error('Original captured payment does not match this order');
      const amount=money(request.data.amountPaise,'Approved refund'),reserved=await one("SELECT COALESCE(SUM(CASE WHEN state='processed' THEN amount_paise ELSE 0 END),0) AS processed,COALESCE(SUM(CASE WHEN state NOT IN ('failed','processed') THEN amount_paise ELSE 0 END),0) AS pending FROM payment_refunds WHERE payment_id=?",paymentId);
      const external=await one("SELECT COALESCE(SUM(json_extract(data,'$.amountPaise')),0) AS total FROM records WHERE kind='Refunds' AND status='Recorded externally' AND json_extract(data,'$.orderId')=? AND COALESCE(json_extract(data,'$.paymentId'),?)=?",order.id,order.data.paymentId,paymentId);
      const refunded=external.total+Math.max(reserved.processed,Number(payment.amount_refunded||0),payment.status==='refunded'?payment.amount:0);
      if(amount<100||amount+reserved.pending+refunded>payment.amount)throw Error('Refund exceeds the unreserved captured amount or is below INR 1');
      const payload={key:crypto.randomUUID(),environment:secrets().FINANCE_MODE||'test',recovery:recovery?.id||'',body:{amount,receipt:'rf-'+(await digest(id)).slice(0,30),notes:{refundCaseId:id}}};
      await execute("INSERT INTO payment_refunds VALUES(?,?,?,?,?,'Sending',NULL,'',?,?)",id,order.id,amount,paymentId,JSON.stringify(payload),now(),now());
      refund=await one('SELECT * FROM payment_refunds WHERE id=?',id);
    }
    const payload=JSON.parse(refund.request);
    try{const result=await confirmRefund(await providerBridge('POST','/payments/'+refund.payment_id+'/refund',payload.body,payload.key),refund);await audit(id,actor,'Submitted approved customer refund with original idempotency reference');return result}
    catch(e){await execute("UPDATE payment_refunds SET state='Uncertain',last_error=?,updated=? WHERE id=? AND provider_id IS NULL",String((e as Error).message).slice(0,300),now(),id);throw e}
  });
}
export async function recordExternalRefund(id:string,reference:string,actor:string){
  if(!financeSchema())throw Error('Activate the refund ledger before recording an external refund');
  const initial=await record(id),order=await record(initial.data.orderId);
  if(initial.kind!=='Refunds'||initial.data.recoveryId)throw Error('Use provider recovery for an extra or late captured payment');
  return lock('refund-'+(order.data.paymentId||order.id),async()=>{
    const request=await record(id),evidence=request.data.fileKey||request.data.receiptKey;
    if(request.status!=='Approved'||!reference.trim()||!evidence)throw Error('Upload bank evidence and verify the approved refund reference first');
    const automated=await one("SELECT * FROM payment_refunds WHERE id=?",id);
    if(automated&&automated.state!=='failed')throw Error('Reconcile the gateway refund before recording an external bank refund');
    const original=await record(order.id),amount=money(request.data.amountPaise,'Approved refund');
    const reservations=await one("SELECT COALESCE(SUM(amount_paise),0) AS pending FROM payment_refunds WHERE payment_id=? AND state NOT IN ('failed','processed')",original.data.paymentId||'');
    if(amount<100||Number(original.data.refundedPaise||0)+reservations.pending+amount>Math.round(original.data.total*100))throw Error('Refund exceeds the unreserved customer payment');
    const results=await db().batch([
      update(request,'Recorded externally',{...request.data,externalReference:reference.trim().slice(0,200),paymentId:original.data.paymentId||'',recordedBy:actor}),
      db().prepare("UPDATE records SET data=json_set(data,'$.refundedPaise',COALESCE(json_extract(data,'$.refundedPaise'),0)+?),version=version+1,updated=? WHERE id=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND status='Recorded externally' AND json_extract(data,'$.externalReference')=?)").bind(amount,now(),original.id,id,reference.trim().slice(0,200))
    ]);
    if(!results[0].meta.changes)throw Error('Refund changed; refresh before recording');
    await audit(id,actor,'Recorded evidenced external refund '+reference.trim().slice(0,200));
    await notify(request.owner,'Refund recorded','External refund reference '+reference.trim().slice(0,200)+' was recorded by the team.',id);return {ok:true};
  });
}
export async function approveRecoveryRefund(id:string,reason:string,actor:string){
  const recovery=await record(id);if(recovery.kind!=='Payment recovery'||recovery.status!=='Needs review'||!reason.trim()||recovery.data.amountPaise<100)throw Error('Review an unresolved captured-payment recovery and record the reason');
  const order=await record(recovery.data.orderId),caseId='recovery-refund-'+recovery.data.paymentId;
  await execute("INSERT OR IGNORE INTO records VALUES(?,?,'Refunds','Approved',?,?,?,1)",caseId,order.owner,JSON.stringify({title:'Captured-payment recovery refund',orderId:order.id,recoveryId:id,amountPaise:recovery.data.amountPaise,note:reason.slice(0,1000),reviewedBy:actor}),now(),now());await audit(id,actor,'Approved recovery refund review: '+reason.slice(0,500));return {ok:true,id:caseId};
}
export async function refundWebhook(eventId:string,entityId:string,event:string,caseId?:string){
  if(!/^rfnd_[A-Za-z0-9]+$/.test(entityId)||eventId.length>200)throw Error('Invalid refund event');
  let refund=await one('SELECT * FROM payment_refunds WHERE provider_id=?',entityId);
  if(!refund&&caseId)refund=await one('SELECT * FROM payment_refunds WHERE id=? AND provider_id IS NULL',caseId);
  if(!refund){
    const entity=await providerBridge('GET','/refunds/'+entityId);
    const match=await one("SELECT id FROM records WHERE kind='Orders' AND json_extract(data,'$.paymentId')=?",entity.payment_id||'');
    if(!match)return {ignored:true};
    const order=await record(match.id),id='provider-refund-'+entityId;
    if(entity.currency!=='INR'||entity.environment!==order.data.paymentEnvironment||entity.amount<100||entity.amount>Math.round(order.data.total*100))throw Error('External provider refund needs manual reconciliation');
    const request={external:true,environment:entity.environment,body:{receipt:entity.receipt||'',notes:{}}};
    await db().batch([
      db().prepare("INSERT OR IGNORE INTO records VALUES(?,?,'Refunds','Provider reconciliation',?,?,?,1)").bind(id,order.owner,JSON.stringify({title:'Provider dashboard refund '+entityId,orderId:order.id,amountPaise:entity.amount,reason:'Refund created outside the website; review supplier liability separately'}),now(),now()),
      db().prepare("INSERT OR IGNORE INTO payment_refunds VALUES(?,?,?,?,?,'pending',?,'',?,?)").bind(id,order.id,entity.amount,entity.payment_id,JSON.stringify(request),entity.id,now(),now())
    ]);
    refund=await one('SELECT * FROM payment_refunds WHERE id=?',id);
  }
  if(await one('SELECT id FROM finance_events WHERE id=?',eventId))return {duplicate:true};
  await lock('refund-'+refund.payment_id,async()=>confirmRefund(await providerBridge('GET','/refunds/'+entityId),await one('SELECT * FROM payment_refunds WHERE id=?',refund.id)));
  await execute('INSERT OR IGNORE INTO finance_events VALUES(?,?,?,?)',eventId,entityId,event,now());return {ok:true};
}
export async function financeOverview(){
  const readiness=await financeReadiness();if(!financeSchema())return {readiness,charges:[],batches:[],credits:[],refunds:[]};
  return {readiness,alerts:(await rows("SELECT data FROM records WHERE kind='Finance alerts' AND status='Open' ORDER BY updated DESC LIMIT 100")).map((r:any)=>JSON.parse(r.data)),recovery:(await rows("SELECT id,status,data FROM records WHERE kind IN ('Payment recovery','Payment intents') AND status IN ('Needs review','Needs reconciliation','Creating') ORDER BY updated DESC LIMIT 100")).map((r:any)=>({...r,data:JSON.parse(r.data)})),charges:await rows("SELECT * FROM printer_charges WHERE json_extract(payload,'$.environment')=? ORDER BY updated DESC LIMIT 100",secrets().FINANCE_MODE||'test'),batches:await rows("SELECT * FROM printer_batches WHERE json_extract(manifest,'$.environment')=? ORDER BY day DESC LIMIT 60",secrets().FINANCE_MODE||'test'),attempts:(await rows('SELECT id,batch_id,state,provider_id,utr,fee_paise,tax_paise,last_error,updated FROM printer_attempts ORDER BY updated DESC LIMIT 100')),credits:await rows("SELECT x.* FROM printer_credits x JOIN printer_charges c ON c.order_id=x.order_id WHERE json_extract(c.payload,'$.environment')=? ORDER BY x.created DESC LIMIT 100",secrets().FINANCE_MODE||'test'),refunds:await rows("SELECT r.id,r.status,json_extract(r.data,'$.orderId') AS order_id,json_extract(r.data,'$.amountPaise') AS amount_paise,p.state,p.provider_id,p.last_error FROM records r LEFT JOIN payment_refunds p ON p.id=r.id WHERE r.kind='Refunds' ORDER BY r.updated DESC LIMIT 100"),orders:await rows("SELECT id,status,json_extract(data,'$.title') AS title,json_extract(data,'$.total') AS total,json_extract(data,'$.printingOrderId') AS remote_id,json_extract(data,'$.printingStage') AS printing_stage,json_extract(data,'$.paymentMethod') AS payment_method,json_extract(data,'$.paymentEnvironment') AS payment_environment,json_extract(data,'$.paidAt') AS paid_at,json_extract(data,'$.refundedPaise') AS refunded_paise FROM records WHERE kind='Orders' ORDER BY updated DESC LIMIT 100")};
}
export async function remittanceCSV(id:string){const b=await one('SELECT * FROM printer_batches WHERE id=?',id);if(!b)throw Error('Batch not found');const m=JSON.parse(b.manifest);return safeCSV([['Batch','OpenShelf order','WooCommerce order','Invoice','Revision','Printing INR','Shipping INR','Tax INR','Discount INR','Payable INR'],...m.items.map((i:any)=>[id,i.orderId,i.remoteId,i.invoice,i.revision,i.charge.productionPaise/100,i.charge.shippingPaise/100,i.charge.taxPaise/100,i.charge.discountPaise/100,i.amountPaise/100]),...m.credits.map((c:any)=>[id,c.orderId,'',c.reference,'','','','','',-c.amountPaise/100]),[id,'TOTAL','','','','','','','',m.totalPaise/100]])}
export async function runSettlementQueue(){
  if(!financeSchema())return {disabled:true};
  const mode=secrets().FINANCE_MODE||'test';
  const day=closedSettlementDay();if(day)try{await prepareDailyBatch(day)}catch{/* dashboard retains invalid/held work */}
  const policy=await financePolicy();
  if(policy.automatic&&secrets().PAYOUTS_ENABLED==='1')for(const b of await rows("SELECT id,state FROM printer_batches WHERE state IN ('Draft','Approved') AND json_extract(manifest,'$.environment')=? ORDER BY day LIMIT 1",mode)){try{if(b.state==='Draft')await approveDailyBatch(b.id,'Approved daily settlement policy');await submitDailyBatch(b.id,'Scheduled payout')}catch(e){await audit(b.id,'Settlement queue','Payout held: '+String((e as Error).message).slice(0,200))}}
  const receipts=await rows("SELECT id FROM printer_batches WHERE state IN ('Settled','Reversed') AND acknowledged!=1 AND json_extract(manifest,'$.environment')=? ORDER BY day LIMIT 2",mode);
  await Promise.allSettled(receipts.map(b=>acknowledgeBatch(b.id))); // Receipt retries never repeat bank payments.
  // Webhooks are primary. This is a daily recovery check for missed notifications.
  for(const b of await rows("SELECT id FROM printer_batches WHERE state IN ('queued','pending','processing','Settled') AND json_extract(manifest,'$.environment')=? AND updated<? LIMIT 5",mode,new Date(Date.now()-86400000).toISOString()))try{await reconcilePayout(b.id)}catch{/* unresolved state remains visible */}
  if(secrets().RESEND_API_KEY&&secrets().EMAIL_FROM)for(const n of await rows("SELECT id FROM records WHERE kind='Notifications' AND status IN ('Unsent','Failed') AND id LIKE 'finance-notice-%' LIMIT 5"))try{const {sendNotification}=await import('./providers');await sendNotification(await record(n.id))}catch{/* persistent notification outbox */}
  return {ok:true};
}
