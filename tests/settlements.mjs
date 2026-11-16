import ts from 'typescript';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const prepare=(query,args=[])=>({sql:query,bind(...values){return prepare(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}});
const database={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
globalThis.__env={DB:database,SETTLEMENT_SCHEMA:'1',RAZORPAY_KEY_ID:'rzp_test_synthetic',RAZORPAY_KEY_SECRET:'synthetic-gateway-secret',PRINTING_ENABLED:'1',PRINTING_SECRET:'synthetic-printing-secret-over-32-characters',PAYOUTS_ENABLED:'1',REFUNDS_ENABLED:'1',FINANCE_MODE:'test',PROVIDER_RELAY_URL:'https://relay.example.test',PROVIDER_RELAY_SECRET:'synthetic-private-relay-secret-over-32-characters',RAZORPAY_WEBHOOK_SECRET:'synthetic-payment-webhook',RAZORPAYX_WEBHOOK_SECRET:'synthetic-payout-webhook'};
let identity={userId:'admin',email:'admin@example.test',displayName:'Admin'};globalThis.__getUser=async()=>identity;
const dir='.sites-runtime/settlements';mkdirSync(dir,{recursive:true});
for(const [name,path]of Object.entries({'checkout-intent':'lib/checkout-intent.ts',server:'lib/server.ts',business:'lib/business.ts','printing-contract':'lib/printing-contract.ts','printing':'lib/printing.ts','providers':'lib/providers.ts','provider-bridge':'lib/provider-bridge.ts','settlement-contract':'lib/settlement-contract.ts',settlements:'lib/settlements.ts',api:'app/api/settlements/route.ts',webhook:'app/api/webhooks/razorpayx/route.ts'})){
 let source=readFileSync(path,'utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__env;').replace(/import \{getApplicationUser\} from '[^']+';/,'const getApplicationUser=globalThis.__getUser;');
 source=source.replace(/(['"])(?:\.\.?\/)+(?:lib\/)?(checkout-intent|server|business|printing-contract|printing|providers|provider-bridge|settlement-contract|settlements)\1/g,(_,q,n)=>q+'./'+n+'.mjs'+q);
 writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const server=await import('../'+dir+'/server.mjs'),s=await import('../'+dir+'/settlements.mjs'),c=await import('../'+dir+'/settlement-contract.mjs'),cryptoHelpers=await import('../'+dir+'/business.mjs'),hash=await import('../'+dir+'/printing-contract.mjs'),api=await import('../'+dir+'/api.mjs'),webhook=await import('../'+dir+'/webhook.mjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
await server.user();sql.prepare("UPDATE members SET role='admin' WHERE id='admin'").run();
await server.create('system','Configuration','Configured',{launchReady:true,policies:{privacy:'Approved',terms:'Approved',shipping:'Approved',returns:'Approved'},businessName:'Synthetic Publisher',address:'Synthetic business address',contactEmail:'admin@example.test'},'site-config');
await s.saveFinancePolicy({automatic:false,termsAccepted:true,dailyLimitPaise:1000000},'admin');
eq(c.closedSettlementDay(Date.parse('2026-11-17T18:40:00Z')),null);eq(c.closedSettlementDay(Date.parse('2026-11-17T18:45:00Z')),'2026-11-17');eq(c.closedSettlementDay(Date.parse('2026-11-16T20:00:00Z')),'2026-11-16');
eq(c.cutoff('2026-11-16'),'2026-11-16T18:30:00.000Z');
eq(c.payoutTransition('processed','queued'),'processed');eq(c.payoutTransition('processed','reversed'),'reversed');eq(c.payoutTransition('reversed','processed'),'reversed');
assert(c.safeCSV([['=SUM(1,2)','+1','@cmd','-4']]).includes("'=SUM"));checks++;
const old=new Date(Date.now()-3*86400000).toISOString();const day=c.closedSettlementDay();assert(day);
let ready=false,beneficiary='fa_printer',payoutCalls=0,ackCalls=0,timeout=false,state='queued',providerId='pout_A',payoutPayload,payoutKey,refundState='pending',refundCalls=0,healthMode='test';
const payouts=new Map();
globalThis.fetch=async(url,options={})=>{
 if(new URL(url).origin==='https://onlineprintingz.in'){
  if(new URL(url).pathname.endsWith('/capabilities'))return Response.json({version:3,supplierSettlements:true});
  const body=JSON.parse(options.body);ackCalls++;eq(body.amountPaise,JSON.parse(body.manifestJSON).totalPaise);return Response.json({accepted:true,batchId:body.batchId,cursor:body.cursor});
 }
 eq(new URL(url).origin,'https://relay.example.test');
 const path=new URL(url).pathname,raw=options.body||'',time=options.headers['X-OSP-Timestamp'],key=options.headers['X-OSP-Idempotency'];
 eq(options.headers['X-OSP-Signature'],await cryptoHelpers.hmac(__env.PROVIDER_RELAY_SECRET,[time,options.method,path,key,await hash.digest(raw)].join('\n')));
 if(path==='/health')return Response.json({ready,keyId:__env.RAZORPAY_KEY_ID,mode:healthMode,allowlistConfirmed:ready,activationConfirmed:ready,beneficiaryId:beneficiary,debitLast4:'1234'});
 if(path==='/payouts'){
  payoutCalls++;const body=JSON.parse(raw);if(payoutPayload){eq(body,payoutPayload);eq(key,payoutKey)}else{payoutPayload=body;payoutKey=key;}
  const entity={id:providerId,amount:body.amount,currency:'INR',fund_account_id:body.beneficiaryId,reference_id:body.reference_id,status:state,utr:'',fees:500,tax:90,environment:'test'};payouts.set(providerId,entity);
  if(timeout){timeout=false;throw Error('Synthetic timeout after provider accepted request')}
  return Response.json(entity);
 }
 if(path.startsWith('/payouts/')){const entity=payouts.get(path.split('/').pop());return Response.json({...entity,status:state,utr:state==='processed'?'SYNTHETIC-UTR':''})}
 if(path==='/refunds/rfnd_outside')return Response.json({id:'rfnd_outside',payment_id:'pay_Outside',amount:500,currency:'INR',environment:'test',status:'processed'});
 if(path==='/payments/pay_A')return Response.json({environment:'test',id:'pay_A',order_id:'order_A',amount:19500,currency:'INR',status:'captured'});
 if(path==='/payments/pay_A/refund'){refundCalls++;const body=JSON.parse(raw);return Response.json({environment:'test',id:'rfnd_A',currency:'INR',payment_id:'pay_A',amount:body.amount,receipt:body.receipt,notes:body.notes,status:refundState})}
 if(path==='/refunds/rfnd_A'){const row=sql.prepare('SELECT * FROM payment_refunds WHERE provider_id=?').get('rfnd_A');const body=JSON.parse(row.request).body;return Response.json({environment:'test',id:'rfnd_A',currency:'INR',payment_id:'pay_A',amount:body.amount,receipt:body.receipt,notes:body.notes,status:refundState})}
 throw Error('Unexpected provider path '+path);
};
const makeOrder=async(id,remote=100)=>{
 await server.create('customer-'+id,'Orders','Paid',{title:'Real book '+id,total:195,paidAt:old,paymentId:'pay_'+id,paymentMethod:'Razorpay captured',paymentEnvironment:'test',providerOrder:'order_'+id,printingOrderId:remote,printingStage:'Awaiting approval'},id);
 sql.prepare('INSERT INTO printing_snapshots VALUES(?,?,?)').run(id,JSON.stringify([{title:'Real book '+id,isbn:'9780306406157'}]),old);
 return server.record(id);
};
const quote=(remote,id,revision=1,production=7140)=>({id:remote,sourceOrder:id,charge:{revision,invoice:'SUP-'+id,productionPaise:production,shippingPaise:5000,taxPaise:0,discountPaise:0,confirmedAt:old}});
const a=await makeOrder('A',101),b=await makeOrder('B',102);
await s.ingestSupplierCharge(a,quote(101,'A'));await s.ingestSupplierCharge(b,quote(102,'B',1,10000));
eq(sql.prepare('SELECT state FROM printer_charges WHERE order_id=?').get('A').state,'Review');
await rejects(()=>s.approveSupplierCharge('A',2,'admin'),/Refresh/);
await s.approveSupplierCharge('A',1,'admin');await s.approveSupplierCharge('B',1,'admin');
eq((await s.prepareDailyBatch(day)).empty,true); // Approvals happened after yesterday's cutoff.
sql.prepare('UPDATE printer_charges SET approved_at=?').run(old);
const batch=await s.prepareDailyBatch(day);eq(batch.amount_paise,27140);eq(JSON.parse(batch.manifest).items.length,2);eq((await s.prepareDailyBatch(day)).id,batch.id);
eq(sql.prepare('SELECT COUNT(*) n FROM printer_batch_items').get().n,2);
await rejects(()=>s.approveDailyBatch(batch.id,'admin'),/activation|allowlisting/i);eq(payoutCalls,0);
ready=true;await s.approveDailyBatch(batch.id,'admin');
beneficiary='fa_changed';await rejects(()=>s.submitDailyBatch(batch.id,'admin'),/beneficiary/i);eq(payoutCalls,0);beneficiary='fa_printer';
__env.PAYOUTS_ENABLED='0';await rejects(()=>s.submitDailyBatch(batch.id,'admin'),/disabled/);eq(payoutCalls,0);__env.PAYOUTS_ENABLED='1';
timeout=true;await rejects(()=>s.submitDailyBatch(batch.id,'admin'),/timeout/);eq(sql.prepare('SELECT state FROM printer_batches').get().state,'Uncertain');
const results=await Promise.allSettled([s.submitDailyBatch(batch.id,'admin'),s.submitDailyBatch(batch.id,'admin')]);eq(results.filter(r=>r.status==='fulfilled').length,1);eq(payoutCalls,2);
eq(sql.prepare('SELECT state FROM printer_batches').get().state,'queued');eq(sql.prepare('SELECT state FROM printer_charges WHERE order_id=?').get('A').state,'Batched');
// A signed processed event cannot settle a still-queued canonical provider payout.
await s.payoutWebhook('event-queued','pout_A','payout.processed');eq(sql.prepare('SELECT state FROM printer_batches').get().state,'queued');
state='processed';await s.payoutWebhook('event-processed','pout_A','payout.processed');eq(sql.prepare('SELECT state FROM printer_batches').get().state,'Settled');eq(sql.prepare('SELECT state FROM printer_charges WHERE order_id=?').get('A').state,'Settled');
eq((await s.payoutWebhook('event-processed','pout_A','payout.processed')).duplicate,true);
await s.acknowledgeBatch(batch.id);eq(ackCalls,1);await s.acknowledgeBatch(batch.id);eq(ackCalls,1);
state='reversed';await s.payoutWebhook('event-reversed','pout_A','payout.reversed');eq(sql.prepare('SELECT state FROM printer_batches').get().state,'Reversed');eq(sql.prepare('SELECT acknowledged FROM printer_batches').get().acknowledged,0);await s.acknowledgeBatch(batch.id);eq(ackCalls,2);
await s.resetFailedPayout(batch.id,'admin');eq(sql.prepare('SELECT state FROM printer_batches').get().state,'Draft');eq(sql.prepare('SELECT COUNT(*) n FROM printer_attempts').get().n,1);
// Credits require evidence and cannot exceed an already settled invoice.
sql.prepare("UPDATE printer_charges SET state='Settled' WHERE order_id='A'").run();await server.create('admin','Files','Uploaded',{fileKey:'private-credit-document'},'credit-evidence');
await rejects(()=>s.addSupplierCredit({orderId:'A',amountPaise:999999,reference:'CREDIT-1',reason:'Agreed supplier rebate',evidenceId:'credit-evidence'},'admin'),/within/);
await s.addSupplierCredit({orderId:'A',amountPaise:1000,reference:'CREDIT-1',reason:'Agreed supplier rebate',evidenceId:'credit-evidence'},'admin');eq(sql.prepare('SELECT amount_paise FROM printer_credits').get().amount_paise,1000);
// Customer refund is separate; it never invokes another supplier payment.
await server.create('customer-A','Refunds','Approved',{orderId:'A',title:'Refund for A',amountPaise:19500},'refund-A');
await s.executeCustomerRefund('refund-A','admin');eq(refundCalls,1);eq(sql.prepare('SELECT state FROM payment_refunds').get().state,'pending');eq(payoutCalls,2);
refundState='processed';await s.refundWebhook('refund-event','rfnd_A','refund.processed');eq((await server.record('refund-A')).status,'Refunded');eq((await server.record('A')).data.refundedPaise,19500);
eq((await s.refundWebhook('refund-event','rfnd_A','refund.processed')).duplicate,true);await s.executeCustomerRefund('refund-A','admin');eq((await server.record('A')).data.refundedPaise,19500);eq(refundCalls,1);
await server.create('customer-A','Refunds','Approved',{orderId:'A',amountPaise:100},'refund-A-extra');await rejects(()=>s.executeCustomerRefund('refund-A-extra','admin'),/exceeds/);
// Test ISBNs and refund holds cannot be approved into real supplier payouts.
const test=await makeOrder('Placeholder',103);sql.prepare('UPDATE printing_snapshots SET payload=? WHERE order_id=?').run(JSON.stringify([{title:'Book',isbn:'9780000000002'}]),test.id);await s.ingestSupplierCharge(test,quote(103,test.id));await rejects(()=>s.approveSupplierCharge(test.id,1,'admin'),/Test/);
const hold=await makeOrder('Held',104);await server.create('customer-Held','Refunds','Requested',{orderId:'Held',amountPaise:100},'refund-Held');await s.ingestSupplierCharge(hold,quote(104,'Held'));eq(sql.prepare('SELECT state FROM printer_charges WHERE order_id=?').get('Held').state,'Held');await rejects(()=>s.approveSupplierCharge('Held',1,'admin'),/refund/);
await s.resolveSupplierHold('Held','Production already incurred; invoice remains payable','admin');await s.approveSupplierCharge('Held',1,'admin');eq(sql.prepare('SELECT state FROM printer_charges WHERE order_id=?').get('Held').state,'Approved');
// No private provider requests/bank account numbers are exported to the browser.
const overview=await s.financeOverview();eq(JSON.stringify(overview).includes('synthetic-private-relay-secret'),false);eq(JSON.stringify(overview).includes('account_number'),false);eq(Object.hasOwn(overview.attempts[0],'request'),false);
const csv=await s.remittanceCSV(batch.id);eq(csv.includes('SUP-A'),true);eq(csv.includes('customer-A'),false);eq(csv.includes('271.4'),true);
identity={userId:'outsider',email:'other@example.test',displayName:'Other'};eq((await api.GET(new Request('https://openshelfpress.com/api/settlements'))).status,403);
identity={userId:'admin',email:'admin@example.test',displayName:'Admin'};
eq((await api.POST(new Request('https://openshelfpress.com/api/settlements',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}))).status,403);
eq((await webhook.POST(new Request('https://openshelfpress.com/api/webhooks/razorpayx',{method:'POST',body:'{}'}))).status,400);
const body=JSON.stringify({event:'payout.processed',payload:{payout:{entity:{id:'pout_A'}}}}),signature=await cryptoHelpers.hmac(__env.RAZORPAYX_WEBHOOK_SECRET,body);
eq((await webhook.POST(new Request('https://openshelfpress.com/api/webhooks/razorpayx',{method:'POST',headers:{'x-razorpay-signature':signature,'x-razorpay-event-id':'event-processed'},body}))).status,200);
// External bank refunds reserve the same captured balance as gateway refunds.
await makeOrder('Manual',105);await server.create('customer-Manual','Refunds','Approved',{orderId:'Manual',amountPaise:5000},'refund-manual');
await rejects(()=>s.recordExternalRefund('refund-manual','BANK-PROOF','admin'),/evidence/);
let manual=await server.record('refund-manual');await server.change(manual,'Approved',{...manual.data,fileKey:'private-bank-proof'});
await s.recordExternalRefund('refund-manual','BANK-PROOF','admin');eq((await server.record('Manual')).data.refundedPaise,5000);
await rejects(()=>s.recordExternalRefund('refund-manual','BANK-PROOF','admin'),/evidence/);eq((await server.record('Manual')).data.refundedPaise,5000);
// No mode switch can approve a test invoice or consume its credits.
__env.FINANCE_MODE='live';await rejects(()=>s.approveSupplierCharge('Held',1,'admin'),/environment/);eq((await s.financeOverview()).charges.length,0);__env.FINANCE_MODE='test';
// Never withdraw a manifest after a provider attempt, including a reversed attempt.
await rejects(()=>s.withdrawUnsentBatch(batch.id,'Revise invoice','admin'),/unsubmitted/);
// Provider-dashboard refunds are ingested once and place supplier liability on hold.
await makeOrder('Outside',108);await s.refundWebhook('outside-refund-event','rfnd_outside','refund.processed');eq((await server.record('Outside')).data.refundedPaise,500);eq((await server.record('provider-refund-rfnd_outside')).status,'Refunded');
await s.refundWebhook('outside-refund-repeat','rfnd_outside','refund.processed');eq((await server.record('Outside')).data.refundedPaise,500);
// Whole supplier credits carry forward when they would consume the payable batch.
const earlierDay=new Date(Date.parse(day)-2*86400000).toISOString().slice(0,10),laterDay=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
await makeOrder('Small',106);await s.ingestSupplierCharge(await server.record('Small'),{...quote(106,'Small'),charge:{...quote(106,'Small').charge,productionPaise:500,shippingPaise:0}});await s.approveSupplierCharge('Small',1,'admin');
sql.prepare("UPDATE printer_charges SET approved_at=? WHERE order_id='Small'").run(old);sql.prepare('UPDATE printer_credits SET created=?').run(old);
const small=await s.prepareDailyBatch(earlierDay);eq(small.amount_paise,500);eq(JSON.parse(small.manifest).credits.length,0);eq(sql.prepare('SELECT state FROM printer_credits').get().state,'Approved');
await s.withdrawUnsentBatch(small.id,'Correct final invoice','admin');eq(sql.prepare('SELECT state FROM printer_batches WHERE id=?').get(small.id).state,'Withdrawn');eq(sql.prepare("SELECT batch_id FROM printer_charges WHERE order_id='Small'").get().batch_id,null);
await makeOrder('Large',107);await s.ingestSupplierCharge(await server.record('Large'),{...quote(107,'Large'),charge:{...quote(107,'Large').charge,productionPaise:1500,shippingPaise:0}});await s.approveSupplierCharge('Large',1,'admin');sql.prepare("UPDATE printer_charges SET approved_at=? WHERE order_id='Large'").run(old);
const credited=await s.prepareDailyBatch(laterDay);eq(credited.amount_paise,500);eq(JSON.parse(credited.manifest).credits.length,1);eq(sql.prepare('SELECT state FROM printer_credits').get().state,'Batched');
// Printer receipts acknowledge a large daily manifest in chunks without another bank call.
const chunkId='ps-test-2026-01-01',chunkManifest={day:'2026-01-01',environment:'test',currency:'INR',totalPaise:2100,grossPaise:2100,credits:[],items:Array.from({length:21},(_,i)=>({orderId:'chunk-'+i,remoteId:200+i,invoice:'CHUNK-'+i,revision:1,amountPaise:100}))};
sql.prepare("INSERT INTO printer_batches(id,day,manifest,amount_paise,state,attempt_id,created,updated) VALUES(?,?,?,2100,'Settled','chunk-attempt',?,?)").run(chunkId,'test:2026-01-01',JSON.stringify(chunkManifest),old,old);
sql.prepare("INSERT INTO printer_attempts(id,batch_id,request,state,provider_id,created,updated) VALUES('chunk-attempt',?,?,'processed','pout_chunk',?,?)").run(chunkId,JSON.stringify({beneficiaryId:'fa_printer',environment:'test'}),old,old);
const beforeChunkAck=ackCalls;await s.acknowledgeBatch(chunkId);eq(sql.prepare('SELECT acknowledged FROM printer_batches WHERE id=?').get(chunkId).acknowledged,-20);await s.acknowledgeBatch(chunkId);eq(sql.prepare('SELECT acknowledged FROM printer_batches WHERE id=?').get(chunkId).acknowledged,1);await s.acknowledgeBatch(chunkId);eq(ackCalls,beforeChunkAck+2);eq(payoutCalls,2);
// Durable checkout claims prevent duplicate provider order creation, even on timeout.
const checkout=await import('../'+dir+'/checkout-intent.mjs');let checkoutCalls=0;
await server.create('customer-checkout','Orders','Awaiting payment',{title:'Checkout book',total:195},'checkout-order');
const checkoutGateway=async(path,body)=>{checkoutCalls++;return {id:'order_claim',amount:body.amount,currency:'INR',receipt:'checkout-order',notes:{recordId:'checkout-order'}}};
const claimed=await Promise.allSettled([checkout.prepareCheckout(await server.record('checkout-order'),checkoutGateway),checkout.prepareCheckout(await server.record('checkout-order'),checkoutGateway)]);
eq(checkoutCalls,1);eq(claimed.filter(r=>r.status==='fulfilled').length,1);eq((await checkout.prepareCheckout(await server.record('checkout-order'),checkoutGateway)).id,'order_claim');eq(checkoutCalls,1);
await server.create('customer-lost','Orders','Awaiting payment',{title:'Lost response',total:195},'lost-checkout');
await rejects(async()=>checkout.prepareCheckout(await server.record('lost-checkout'),async()=>{throw Error('Synthetic lost provider response')}),/lost/);
await rejects(async()=>checkout.prepareCheckout(await server.record('lost-checkout'),checkoutGateway),/reconciliation/);eq(checkoutCalls,1);
await checkout.reconcileCheckout('lost-checkout','order_lost',async()=>({id:'order_lost',amount:19500,currency:'INR',receipt:'lost-checkout',notes:{recordId:'lost-checkout'}}));
eq((await server.record('lost-checkout')).data.providerOrder,'order_lost');
// A captured payment after cancellation creates one recovery case and prevents another checkout.
const lost=await server.record('lost-checkout');await server.change(lost,'Cancelled',lost.data);
const captured={id:'pay_late',order_id:'order_lost',amount:19500,currency:'INR',status:'captured',environment:'test'};
await checkout.recordUnexpectedCapture(await server.record(lost.id),captured);await checkout.recordUnexpectedCapture(await server.record(lost.id),captured);
eq((await server.record(lost.id)).status,'Cancelled');eq((await server.record(lost.id)).data.paymentRecoveryPending,1);eq(sql.prepare("SELECT COUNT(*) n FROM records WHERE id='payment-recovery-pay_late'").get().n,1);
eq((await checkout.recordUnexpectedCapture(await server.record(lost.id),{...captured,id:'pay_fullyrefunded',status:'refunded',amount_refunded:19500})).alreadyRefunded,true);
console.log(`${checks} supplier charge, cutoff, payout, reversal, refund, permission and reconciliation checks passed; all external calls mocked`);
