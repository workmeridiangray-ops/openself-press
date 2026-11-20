export function paise(value:unknown):number{const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000000)throw Error('Enter a valid non-negative amount');return Math.round(n*100)}
export function quantity(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Error('Enter a whole quantity between 1 and 1,000,000');return n}
export function saleTotals(input:any){const units=quantity(input.units);const gross=paise(input.gross),fees=paise(input.fees||0),production=paise(input.production||0);if(fees+production>gross)throw Error('Fees and production cost exceed sale revenue');const basisPoints=Math.round(Number(input.authorShare)*100);if(!Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>10000)throw Error('Author share must be between 0 and 100');return {units,grossPaise:gross,feePaise:fees,costPaise:production,netPaise:gross-fees-production,royaltyPaise:Math.round((gross-fees-production)*basisPoints/10000),shareBasisPoints:basisPoints,currency:'INR'}}
export function sameHex(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
export async function hmac(secret:string,text:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('')}
export const safeURL=(s:unknown)=>{try{const u=new URL(String(s));if(u.protocol!=='https:')return '';return u.href}catch{return ''}};
// Email delivery: Brevo (BREVO_API_KEY) if set, otherwise Resend (RESEND_API_KEY). Both need EMAIL_FROM, e.g. "Open Shelf Press <orders@example.com>".
export const emailReady=(e:any)=>!!(e?.EMAIL_FROM&&(e.BREVO_API_KEY||e.RESEND_API_KEY));
export async function sendEmail(e:any,m:{to:string,subject:string,text:string,key?:string,timeoutMs?:number}):Promise<{ok:boolean,id?:string,error?:string}>{
  const from=String(e.EMAIL_FROM||'').trim(),parsed=from.match(/^(.*)<([^>]+)>\s*$/),sender=parsed?{name:parsed[1].trim().replace(/^"|"$/g,'')||undefined,email:parsed[2].trim()}:{email:from};
  const signal=AbortSignal.timeout(m.timeoutMs||10000);
  const brevo=!!e.BREVO_API_KEY;
  const response=brevo
    ?await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal,headers:{'api-key':e.BREVO_API_KEY,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender,to:[{email:m.to}],subject:m.subject,textContent:m.text})})
    :await fetch('https://api.resend.com/emails',{method:'POST',signal,headers:{Authorization:'Bearer '+e.RESEND_API_KEY,'Content-Type':'application/json',...(m.key?{'Idempotency-Key':m.key}:{})},body:JSON.stringify({from,to:[m.to],subject:m.subject,text:m.text})});
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:String(body.message||'Provider rejected email')};
  return {ok:true,id:brevo?body.messageId:body.id};
}
