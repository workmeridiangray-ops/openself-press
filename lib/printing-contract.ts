/* eslint-disable @typescript-eslint/no-explicit-any -- Existing D1 JSON record boundary; network fields are validated before use. */
// Shared, provider-independent rules. Amounts are integer paise throughout.
export const printStages = ['Awaiting approval','In production','Ready to ship','Dispatched','Delivered'] as const;
export type PrintStage = typeof printStages[number];
export const printBindings = ['Paperback','Hardcase'] as const;
export type PrintBinding = typeof printBindings[number];
// Online Printingz WooCommerce product per binding: Perfect Binding / Case Binding.
export const printProducts: Record<PrintBinding, number> = {Paperback:12982,Hardcase:14195};
// Supplied per-copy case-bind rates (paise). Sizes without a supplied rate are refused, never inferred.
export const caseBindPaise: Record<string, number> = {A5:22500,A4:25000};
export function printBinding(value: any): PrintBinding {
  if (!printBindings.includes(value)) throw Error('Printing supports Paperback and Hardcase editions only');
  return value as PrintBinding;
}
export type PrintConfig = {
  size: 'A5'|'A4'|'B5'|'6x9'|'B6'; paper: string; gsm: number;
  blackPages: number; colourPages: number; lamination: 'Matte'|'Gloss';
  unitWeightGrams: number; approved: boolean;
};
export function printConfig(value: any, pages: number): PrintConfig {
  if (!value?.approved) throw Error('Staff must approve the edition printing configuration');
  if (!['A5','A4','B5','6x9','B6'].includes(value.size)) throw Error('Choose an explicitly priced print size');
  if (!Number.isInteger(pages)||pages<24||pages>2000) throw Error('Printing supports 24–2,000 pages');
  for (const key of ['blackPages','colourPages']) if (!Number.isInteger(value[key])||value[key]<0) throw Error('Enter whole B&W and colour page counts');
  if (value.blackPages+value.colourPages!==pages) throw Error('B&W and colour pages must equal the edition page count');
  if (!String(value.paper||'').trim()||String(value.paper).length>120) throw Error('Enter the approved paper specification');
  if (!Number.isInteger(value.gsm)||value.gsm<50||value.gsm>400) throw Error('Enter the approved paper GSM');
  if (!['Matte','Gloss'].includes(value.lamination)) throw Error('Choose cover lamination');
  if (!Number.isFinite(value.unitWeightGrams)||value.unitWeightGrams<=0||value.unitWeightGrams>10000) throw Error('Enter a positive per-copy weight in grams');
  return {size:value.size,paper:value.paper.trim(),gsm:value.gsm,blackPages:value.blackPages,colourPages:value.colourPages,lamination:value.lamination,unitWeightGrams:value.unitWeightGrams,approved:true};
}
export function printCost(c: PrintConfig, copies: number, binding: PrintBinding = 'Paperback') {
  if (!Number.isInteger(copies)||copies<1||copies>10000) throw Error('Enter 1–10,000 copies');
  const pages=c.blackPages+c.colourPages;
  const band=pages<=500?0:pages<=1000?1:pages<=2000?2:-1;
  if (band<0) throw Error('No approved rate above 2,000 pages');
  const rates={A5:[35,42,40],A4:[70,76,75],B5:[45,52,50],'6x9':[45,52,50],B6:[25,32,30]};
  const small=['A5','B6'].includes(c.size);
  if (binding==='Hardcase'&&!(c.size in caseBindPaise)) throw Error('No approved hardcase rate for size '+c.size);
  const bind=binding==='Hardcase'?caseBindPaise[c.size]:small?([4000,2800,3400,2800,3000][copies-1]??2500):copies<10?4200:copies<100?4000:3400;
  const unitPaise=c.blackPages*rates[c.size][band]+c.colourPages*(small?500:1000)+bind;
  return {unitPaise,totalPaise:unitPaise*copies,bindingPaise:bind,excludes:'Shipping and taxes; production estimate pending printer review'};
}
export function printAddress(d:any) {
  const result:any={};
  for (const k of ['name','address','city','state','pin','phone']) {
    const s=String(d[k]||'').trim();
    if (!s||s.length>(k==='address'?1000:200)) throw Error('Complete the delivery name, address and phone before printing');
    result[k]=s;
  }
  if (!/^[1-9]\d{5}$/.test(result.pin)||!/^[0-9 +()-]{10,16}$/.test(result.phone)) throw Error('Check the Indian PIN and delivery phone');
  result.country='IN';
  return result;
}
export function nextPrintStage(current:string,incoming:string,tracking?:any) {
  const i=printStages.indexOf(incoming as PrintStage),previous=printStages.indexOf(current as PrintStage);
  if (i<0) throw Error('Unknown printing stage');
  if (i>=3&&(!String(tracking?.carrier||'').trim()||!String(tracking?.tracking||'').trim())) throw Error('Dispatched orders require carrier and tracking');
  return i<previous?current:incoming;
}
export async function digest(text:string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function signedHeaders(secret:string,method:string,path:string,body:string,now=Date.now()) {
  const timestamp=String(Math.floor(now/1000));
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const message=[timestamp,method.toUpperCase(),path,await digest(body)].join('\n');
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(message)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  return {'X-OSP-Timestamp':timestamp,'X-OSP-Signature':signature};
}
export async function authenticatePrintRequest(req:Request,secret:string,now=Date.now()) {
  const stamp=req.headers.get('x-osp-timestamp')||'',sig=req.headers.get('x-osp-signature')||'';
  if (secret.length<32||!/^\d{10}$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300||!/^[a-f0-9]{64}$/.test(sig)) return false;
  const url=new URL(req.url),raw=await req.clone().text();
  const expected=(await signedHeaders(secret,req.method,url.pathname+url.search,raw,Number(stamp)*1000))['X-OSP-Signature'];
  let different=0;for(let i=0;i<64;i++)different|=expected.charCodeAt(i)^sig.charCodeAt(i);
  return different===0;
}
