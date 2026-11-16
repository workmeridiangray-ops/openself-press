import http from 'node:http';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function configuration(env=process.env){
 const mode=env.PAYOUT_MODE||'test',maximum=Number(env.MAX_PAYOUT_PAISE||1000000);
 const paymentsReady=!!(env.RELAY_SECRET?.length>=32&&env.RAZORPAY_KEY_ID?.startsWith(mode==='live'?'rzp_live_':'rzp_test_')&&env.RAZORPAY_KEY_SECRET&&env.ALLOWLIST_CONFIRMED==='1');
 const configured=!!(['NEFT','IMPS','RTGS'].includes(env.PAYOUT_TRANSFER_MODE||'NEFT')&&['test','live'].includes(mode)&&Number.isSafeInteger(maximum)&&maximum>=100&&maximum<=100000000&&paymentsReady&&/^fa_[A-Za-z0-9]+$/.test(env.PRINTER_FUND_ACCOUNT_ID||'')&&/^\d{6,30}$/.test(env.PAYOUT_SOURCE_ACCOUNT||'')&&env.PAYOUT_ACTIVATION_CONFIRMED==='1');
 return {mode,configured,paymentsReady,fundAccount:env.PRINTER_FUND_ACCOUNT_ID||'',maximum};
}
export function makeHandler(env=process.env,providerFetch=fetch){
 const cfg=configuration(env),seen=new Map();
 return async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
  try{
   if(!env.RELAY_SECRET||env.RELAY_SECRET.length<32)return send(503,{error:'Relay is not configured'});
   const path=req.url,method=req.method;
   if(!/^\/(health|payouts(?:\/pout_[A-Za-z0-9]+)?|orders(?:\/order_[A-Za-z0-9]+)?|payments\/pay_[A-Za-z0-9]+(?:\/refund)?|refunds\/rfnd_[A-Za-z0-9]+)$/.test(path||''))return send(404,{error:'Unsupported operation'});
   if(!['GET','POST'].includes(method))return send(405,{error:'Unsupported method'});
   let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>65536)return send(413,{error:'Request too large'})}
   const time=String(req.headers['x-osp-timestamp']||''),key=String(req.headers['x-osp-idempotency']||''),sig=String(req.headers['x-osp-signature']||'');
   if(!/^\d{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>300||!/^[a-f0-9]{64}$/.test(sig))return send(403,{error:'Not authorised'});
   const message=[time,method,path,key,createHash('sha256').update(raw).digest('hex')].join('\n');
   const expected=createHmac('sha256',env.RELAY_SECRET).update(message).digest('hex');
   if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return send(403,{error:'Not authorised'});
   if(path==='/health'&&method==='GET')return send(200,{ready:cfg.configured,paymentsReady:cfg.paymentsReady,keyId:env.RAZORPAY_KEY_ID||'',mode:cfg.mode,beneficiaryId:cfg.fundAccount,debitLast4:String(env.PAYOUT_SOURCE_ACCOUNT||'').slice(-4),allowlistConfirmed:env.ALLOWLIST_CONFIRMED==='1',activationConfirmed:env.PAYOUT_ACTIVATION_CONFIRMED==='1',maximumPaise:cfg.maximum});
   if(path.startsWith('/payouts')?!cfg.configured:!cfg.paymentsReady)return send(503,{error:'Activation, keys, source account, beneficiary or allowlisting is incomplete'});
   const idempotent=path==='/payouts'||path.endsWith('/refund');
   if(method==='POST'&&idempotent&&!/^[a-f0-9-]{36}$/.test(key))return send(400,{error:'A persisted UUID idempotency key is required'});
   if(method==='GET'&&!(path.startsWith('/payouts/pout_')||/^\/orders\/order_[A-Za-z0-9]+$/.test(path)||/^\/payments\/pay_[A-Za-z0-9]+$/.test(path)||path.startsWith('/refunds/rfnd_')))return send(405,{error:'Unsupported read'});
   if(method==='POST'&&!(path==='/payouts'||path==='/orders'||/^\/payments\/pay_[A-Za-z0-9]+\/refund$/.test(path)))return send(405,{error:'Unsupported write'});
   let body=method==='POST'?JSON.parse(raw):null;
   if(method==='POST'){
    const ceiling=path==='/payouts'?cfg.maximum:Number(env.MAX_CUSTOMER_PAYMENT_PAISE||100000000);
    if(!Number.isSafeInteger(ceiling)||ceiling<100||!body||!Number.isSafeInteger(body.amount)||body.amount<100||body.amount>ceiling)return send(400,{error:'Amount exceeds the configured relay ceiling or is invalid'});
    if(path==='/payouts'){
     if(!/^ps-(test|live)-\d{4}-\d{2}-\d{2}$/.test(body.reference_id||'')||body.currency!=='INR'||body.beneficiaryId!==cfg.fundAccount||body.environment!==cfg.mode||!body.reference_id.startsWith('ps-'+cfg.mode+'-')||!/^[a-f0-9]{64}$/.test(body.manifestHash||''))return send(400,{error:'Payout reference, currency, environment or beneficiary mismatch'});
     body={account_number:env.PAYOUT_SOURCE_ACCOUNT,fund_account_id:cfg.fundAccount,amount:body.amount,currency:'INR',mode:env.PAYOUT_TRANSFER_MODE||'NEFT',purpose:'vendor bill',queue_if_low_balance:true,reference_id:body.reference_id,narration:'OpenShelf printer settlement',notes:{batch:body.reference_id,manifest:body.manifestHash||''}};
    }else if(path==='/orders'){
     if(body.currency!=='INR'||typeof body.receipt!=='string'||body.receipt.length>40)return send(400,{error:'Invalid checkout order'});
     body={amount:body.amount,currency:'INR',receipt:body.receipt,notes:body.notes||{}};
    }else body={amount:body.amount,speed:'normal',receipt:String(body.receipt||'').slice(0,40),notes:body.notes||{}};
   }
   // Non-idempotent checkout creation is never transparently replayed here.
   const replay=method==='POST'&&!idempotent?sig:null;
   for(const [k,v]of seen)if(v<Date.now())seen.delete(k);
   if(replay&&seen.has(replay))return send(409,{error:'Checkout request already submitted; reconcile its existing reference'});
   if(replay)seen.set(replay,Date.now()+300000);
   const response=await providerFetch('https://api.razorpay.com/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json',...(method==='POST'&&idempotent?{[path==='/payouts'?'X-Payout-Idempotency':'X-Refund-Idempotency']:key}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const result=await response.json();
   if(!response.ok)return send(response.status===429?429:502,{error:'Provider rejected the operation; inspect the provider dashboard and reconcile the existing reference',providerCode:String(result.error?.code||'').slice(0,80)});
   if(path.startsWith('/payouts')&&result.fund_account_id!==cfg.fundAccount)return send(502,{error:'Provider beneficiary mismatch'});
   // Do not return source bank numbers, recipient identity or provider credentials.
   if(path.startsWith('/payouts'))return send(200,{id:result.id,amount:result.amount,currency:result.currency,fund_account_id:result.fund_account_id,reference_id:result.reference_id,status:result.status,utr:result.utr||'',fees:result.fees||0,tax:result.tax||0,status_details:result.status_details?{reason:String(result.status_details.reason||'').slice(0,100)}:null,environment:cfg.mode});
   return send(200,{...result,environment:cfg.mode});
  }catch{return send(502,{error:'Provider response uncertain; reconcile or retry the same persisted idempotent request'})}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=http.createServer(makeHandler());server.requestTimeout=20000;server.headersTimeout=15000;server.listen(Number(process.env.PORT||8080),'0.0.0.0')}
