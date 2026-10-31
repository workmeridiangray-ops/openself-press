import {CURRENCY_BY_COUNTRY,DEFAULT_CURRENCY,FALLBACK_RATES} from '../../../lib/currency-map';
export const dynamic='force-dynamic';
const json=(v:any,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'private, max-age=3600'}});

let rateCache:{data:Record<string,number>,fetched:number}|null=null;
async function getRates():Promise<Record<string,number>>{
  const now=Date.now();
  if(rateCache&&now-rateCache.fetched<12*60*60*1000)return rateCache.data;
  try{
    const r=await fetch('https://api.frankfurter.app/latest?from=INR',{signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw Error('rate fetch failed');
    const d:any=await r.json();
    if(d&&d.rates){rateCache={data:{...d.rates,INR:1},fetched:now};return rateCache.data}
    throw Error('no rates in response');
  }catch{
    return rateCache?.data||FALLBACK_RATES;
  }
}

export async function GET(req:Request){
  const country=(req.headers.get('cf-ipcountry')||'IN').toUpperCase();
  const match=CURRENCY_BY_COUNTRY[country];
  if(!match||match.code==='INR')return json({country,code:'INR',symbol:'₹',locale:'en-IN',rate:1});
  const rates=await getRates();
  const rate=rates[match.code]||FALLBACK_RATES[match.code]||null;
  if(!rate)return json({country,code:'INR',symbol:'₹',locale:'en-IN',rate:1});
  return json({country,code:match.code,symbol:match.symbol,locale:match.locale,rate});
}
