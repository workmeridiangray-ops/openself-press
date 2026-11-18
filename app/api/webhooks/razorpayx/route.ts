/* eslint-disable @typescript-eslint/no-explicit-any -- Signed provider event boundary. */
import {secrets,reply} from '../../../../lib/server';
import {hmac,sameHex} from '../../../../lib/business';
import {payoutWebhook,financeSchema} from '../../../../lib/settlements';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  if(!financeSchema()||!secrets().RAZORPAYX_WEBHOOK_SECRET)return reply({error:'Payout webhook is not configured'},503);
  const raw=await req.text();if(raw.length>200000)return reply({error:'Payload too large'},413);
  if(!sameHex(await hmac(secrets().RAZORPAYX_WEBHOOK_SECRET,raw),req.headers.get('x-razorpay-signature')||''))return reply({error:'Invalid signature'},400);
  const event=JSON.parse(raw),id=String(req.headers.get('x-razorpay-event-id')||'');
  if(!id)return reply({error:'Event reference required'},400);
  if(!String(event.event||'').startsWith('payout.'))return reply({ignored:true});
  const entity=event.payload?.payout?.entity;
  return reply(await payoutWebhook(id,entity?.id,String(event.event),entity?.reference_id));
}catch(e:any){return reply({error:e.message||'Payout event requires reconciliation'},400)}}
