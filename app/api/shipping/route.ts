import {reply} from '../../../lib/server';
import {shippingRate} from '../../../lib/providers';
export const dynamic='force-dynamic';
// Public, read-only: lets the cart/checkout page show a live courier rate for a PIN code instead of a flat guess.
// No per-title weight is recorded yet, so this assumes ~0.3kg per copy (typical paperback + packaging).
export async function GET(req:Request){try{
  const url=new URL(req.url);
  const pin=String(url.searchParams.get('pin')||'').trim();
  const qty=Math.max(1,Math.min(50,Number(url.searchParams.get('qty'))||1));
  const weightKg=qty*0.3+0.1;
  const result=await shippingRate(pin,weightKg);
  return reply({ok:true,rate:result.rate,etaDays:result.etaDays,courier:result.courier,options:result.options});
}catch(e:any){return reply({ok:false,error:e.message},200)}}
