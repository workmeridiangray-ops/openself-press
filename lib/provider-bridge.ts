/* eslint-disable @typescript-eslint/no-explicit-any -- Narrow server-only provider response boundary. */
import {secrets} from './server';
import {hmac} from './business';
import {digest} from './printing-contract';
export async function providerBridge(method:string,path:string,body?:any,key=''){
  const e=secrets();let target:URL;
  try{target=new URL(e.PROVIDER_RELAY_URL);if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw Error()}catch{throw Error('Configure the HTTPS fixed-egress provider relay')}
  if(!e.PROVIDER_RELAY_SECRET||e.PROVIDER_RELAY_SECRET.length<32)throw Error('Configure the private provider relay secret');
  if(!/^\/(health|payouts(?:\/pout_[A-Za-z0-9]+)?|orders(?:\/order_[A-Za-z0-9]+)?|payments\/pay_[A-Za-z0-9]+(?:\/refund)?|refunds\/rfnd_[A-Za-z0-9]+)$/.test(path))throw Error('Unsupported provider operation');
  const raw=body===undefined?'':JSON.stringify(body),time=String(Math.floor(Date.now()/1000));
  const message=[time,method,path,key,await digest(raw)].join('\n');
  const response=await fetch(target.origin+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-OSP-Timestamp':time,'X-OSP-Idempotency':key,'X-OSP-Signature':await hmac(e.PROVIDER_RELAY_SECRET,message)},...(method==='POST'?{body:raw}:{})});
  if(!response.ok){const err:any=Error('Provider relay returned HTTP '+response.status+'; reconcile the existing request before retrying');err.httpStatus=response.status;throw err}
  return response.json() as Promise<any>;
}
