export const paidOrderStates=['Paid','In production','Ready to ship','Dispatched','Delivered'];
export type SupplierCharge={revision:number;invoice:string;productionPaise:number;shippingPaise:number;taxPaise:number;discountPaise:number;confirmedAt:string};
export function money(value:unknown,label='Amount'){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>100_000_000)throw Error(label+' must be whole paise between 0 and 100000000');return Number(value)}
export function supplierCharge(v:SupplierCharge){
  if(!v||!Number.isSafeInteger(v.revision)||v.revision<1||v.revision>1_000_000)throw Error('Invalid supplier charge revision');
  if(typeof v.invoice!=='string'||!v.invoice.trim()||v.invoice.length>100)throw Error('Supplier invoice/reference is required');
  if(!Number.isFinite(Date.parse(v.confirmedAt))||Math.abs(Date.now()-Date.parse(v.confirmedAt))>366*86400000)throw Error('Invalid supplier confirmation date');
  const amount=money(v.productionPaise)+money(v.shippingPaise)+money(v.taxPaise)-money(v.discountPaise);
  if(amount<100||amount>100_000_000)throw Error('Supplier total must be between INR 1 and INR 1000000');
  return {...v,invoice:v.invoice.trim(),amountPaise:amount};
}
export function closedSettlementDay(time=Date.now()){
  const local=new Date(time+330*60000);
  if(local.getUTCHours()===0&&local.getUTCMinutes()<15)return null;
  return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-1)).toISOString().slice(0,10);
}
export function cutoff(day:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day).toISOString().slice(0,10)!==day)throw Error('Invalid settlement date');return day+'T18:30:00.000Z'}
export const payoutStates=['queued','pending','processing','processed','rejected','cancelled','reversed','failed'];
export function payoutTransition(old:string,next:string){
  if(!payoutStates.includes(next))throw Error('Unknown provider payout state');
  if(old==='reversed')return old;
  if(old==='processed')return next==='reversed'?'reversed':old;
  if(['failed','cancelled','rejected'].includes(old))return old;
  const ranks:Record<string,number>={queued:1,pending:2,processing:3};
  if(ranks[old]&&ranks[next]&&ranks[next]<ranks[old])return old;
  return next;
}
export function safeCSV(rows:unknown[][]){return rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[\t\r\n ]*[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n')}
