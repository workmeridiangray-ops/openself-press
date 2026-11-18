import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {makeHandler,configuration} from '../integrations/provider-relay/server.mjs';
const env={RELAY_SECRET:'synthetic-relay-secret-over-32-characters',RAZORPAY_KEY_ID:'rzp_test_synthetic',RAZORPAY_KEY_SECRET:'synthetic-secret',PAYOUT_MODE:'test',PAYOUT_SOURCE_ACCOUNT:'12345678901234',PRINTER_FUND_ACCOUNT_ID:'fa_printer',ALLOWLIST_CONFIRMED:'1',PAYOUT_ACTIVATION_CONFIRMED:'1',MAX_PAYOUT_PAISE:'100000'};
let checks=0,calls=0,last;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const provider=async(url,opts)=>{calls++;last={url,opts};assert(String(url).startsWith('https://api.razorpay.com/v1/'));eq(opts.redirect,'error');
 if(String(url).endsWith('/orders'))return Response.json({id:'order_synthetic',amount:19500,currency:'INR'});
 if(String(url).includes('/refund'))return Response.json({id:'rfnd_synthetic',amount:100,currency:'INR'});
 return Response.json({id:'pout_synthetic',amount:19500,currency:'INR',fund_account_id:'fa_printer',reference_id:'ps-test-2026-11-16',status:'queued',fees:0,tax:0,debit_account_number:env.PAYOUT_SOURCE_ACCOUNT});
};
const server=http.createServer(makeHandler(env,provider));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
async function call(path,method='GET',body,key='',override={}){const raw=body===undefined?'':JSON.stringify(body),time=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',env.RELAY_SECRET).update([time,method,path,key,createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');return fetch(base+path,{method,headers:{'Content-Type':'application/json','X-OSP-Timestamp':time,'X-OSP-Idempotency':key,'X-OSP-Signature':signature,...override},...(method==='POST'?{body:raw}:{})})}
try{
 eq(configuration(env).configured,true);eq(configuration({...env,MAX_PAYOUT_PAISE:'bad'}).configured,false);eq(configuration({...env,PAYOUT_MODE:'invalid'}).configured,false);eq(configuration({...env,ALLOWLIST_CONFIRMED:'0'}).configured,false);eq(configuration({...env,RAZORPAY_KEY_ID:'rzp_live_wrong'}).configured,false);
 const health=await (await call('/health')).json();eq(health.ready,true);eq(health.debitLast4,'1234');eq(JSON.stringify(health).includes(env.PAYOUT_SOURCE_ACCOUNT),false);eq(calls,0);
 eq((await call('/health','GET',undefined,'',{'X-OSP-Signature':'0'.repeat(64)})).status,403);
 eq((await call('/health','GET',undefined,'',{'X-OSP-Timestamp':'1000000000'})).status,403);
 eq((await call('/arbitrary-url')).status,404);
 const payload={amount:19500,currency:'INR',reference_id:'ps-test-2026-11-16',beneficiaryId:'fa_printer',environment:'test',manifestHash:'a'.repeat(64)},key='00000000-0000-4000-8000-000000000001';
 eq((await call('/payouts','POST',payload)).status,400);eq(calls,0);
 eq((await call('/payouts','POST',{...payload,beneficiaryId:'fa_other'},key)).status,400);eq(calls,0);
 eq((await call('/payouts','POST',{...payload,environment:'live'},key)).status,400);
 eq((await call('/payouts','POST',{...payload,amount:100001},key)).status,400);
 let response=await call('/payouts','POST',payload,key);eq(response.status,200);const payout=await response.json();eq(payout.id,'pout_synthetic');eq(Object.hasOwn(payout,'debit_account_number'),false);
 const outgoing=JSON.parse(last.opts.body);eq(outgoing.account_number,env.PAYOUT_SOURCE_ACCOUNT);eq(outgoing.fund_account_id,'fa_printer');eq(outgoing.purpose,'vendor bill');eq(outgoing.queue_if_low_balance,true);eq(last.opts.headers['X-Payout-Idempotency'],key);eq(last.opts.headers.Authorization,'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'));
 await call('/payouts','POST',payload,key);eq(last.opts.headers['X-Payout-Idempotency'],key);eq(JSON.parse(last.opts.body),outgoing);
 response=await call('/payments/pay_synthetic/refund','POST',{amount:100,receipt:'rf-case',notes:{refundCaseId:'case'}},key);eq(response.status,200);eq(last.opts.headers['X-Refund-Idempotency'],key);eq(JSON.parse(last.opts.body).speed,'normal');
 response=await call('/orders','POST',{amount:19500,currency:'INR',receipt:'order-local',notes:{recordId:'local'}});eq(response.status,200);eq(last.opts.headers['X-Payout-Idempotency'],undefined);
 response=await call('/orders','POST',{amount:19500,currency:'INR',receipt:'order-local',notes:{recordId:'local'}});eq(response.status,409);
 eq((await call('/orders','GET')).status,405);
 console.log(`${checks} fixed-egress relay authentication, beneficiary pinning, limits, idempotency, environment and redaction checks passed; provider fully mocked`);
}finally{await new Promise(r=>server.close(r))}
