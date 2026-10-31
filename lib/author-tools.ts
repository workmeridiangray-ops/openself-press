export const campaignTypes=['Coupon','Shipping offer','Digital promotion','Ads','Booster'] as const;
export const couponTypes=['Single-use','Multi-use','Bulk-use'] as const;
const text=(v:any,max=2000)=>String(v||'').trim().slice(0,max);
export function campaignInput(b:any){
 const title=text(b.title,200),campaignType=text(b.campaignType),startDate=text(b.startDate),endDate=text(b.endDate);
 if(!title||!campaignTypes.includes(campaignType as any))throw Error('Enter a campaign name and choose a campaign type');
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!validDate(startDate)||!validDate(endDate)||startDate>endDate||startDate<new Date().toISOString().slice(0,10))throw Error('Choose valid campaign dates, starting today or later');
 const data:any={title,campaignType,startDate,endDate,bookReference:text(b.bookReference,200),description:text(b.description)};
 if(campaignType==='Coupon'){
  if(!couponTypes.includes(b.couponType))throw Error('Choose a coupon type');
  const discount=Number(b.discount),count=Number(b.couponCount);
  if(!Number.isFinite(discount)||discount<=0||discount>=100||!Number.isInteger(count)||count<1||count>10000)throw Error('Enter a discount above 0 and below 100%, and 1–10,000 coupons');
  Object.assign(data,{couponType:b.couponType,discount,couponCount:count});
  if(b.couponType==='Bulk-use'){const min=Number(b.minCopies),max=Number(b.maxCopies);if(!Number.isInteger(min)||min<2||!Number.isInteger(max)||max<min||max>10000)throw Error('Enter a valid bulk quantity range');Object.assign(data,{minCopies:min,maxCopies:max})}
 }
 if(['Ads','Booster'].includes(campaignType)){if(b.budget!==''&&b.budget!==undefined){const n=Number(b.budget);if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100)))throw Error('Enter a positive proposed budget, or leave it blank');data.proposedBudgetPaise=Math.round(n*100)}data.goals=text(b.goals)}
 return data;
}
export function copyInput(b:any){const count=Number(b.quantity);if(!Number.isInteger(count)||count<1||count>10000)throw Error('Enter 1–10,000 copies');if(!['Paperback','Hardcase'].includes(b.binding))throw Error('Choose a print binding');if(!['Myself','Customer'].includes(b.recipientType))throw Error('Choose the delivery recipient');const fields=['name','address','city','state','pin','phone'];const data:any={quantity:count,binding:b.binding,recipientType:b.recipientType};for(const k of fields)data[k]=text(b[k],k==='address'?1000:200);if(fields.some(k=>!data[k])||!/^[1-9]\d{5}$/.test(data.pin)||!/^[0-9 +()-]{10,15}$/.test(data.phone))throw Error('Complete the delivery address, six-digit PIN and phone');if(b.filesConfirmed!==true)throw Error('Open and confirm the current final interior and cover');return {...data,description:text(b.description),filesConfirmed:true};}
export function profileInput(b:any){const displayName=text(b.displayName,100);if(!displayName)throw Error('Enter your author display name');let website=text(b.website,500);if(website){try{const u=new URL(website);if(u.protocol!=='https:')throw Error();website=u.href}catch{throw Error('Use a full HTTPS website address')}}return {title:displayName,displayName,bio:text(b.bio,3000),website,isPublic:b.isPublic===true};}
export function walletModel(records:any[]){const statements=records.filter(r=>r.kind==='Royalties'&&r.status==='Released');const payouts=records.filter(r=>r.kind==='Payouts'&&!['Cancelled','Rejected'].includes(r.status));const sum=(rows:any[],key:string)=>rows.reduce((n,r)=>n+(Number(r.data[key])||0),0);const released=sum(statements,'royaltyPaise'),paid=sum(payouts.filter(r=>r.status==='Reconciled'),'amountPaise'),reserved=sum(payouts.filter(r=>r.status!=='Reconciled'),'amountPaise');return {statements,payouts,released,paid,reserved,available:released-paid-reserved};}
