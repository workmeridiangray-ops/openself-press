export function authorOverview(data:any){
 const owner=data.user?.userId;
 const records=(data.records||[]).filter((r:any)=>owner&&r.owner===owner);
 const books=records.filter((r:any)=>r.kind==='Publishing');
 const sales=records.filter((r:any)=>r.kind==='Sales'&&['Posted','Allocated'].includes(r.status));
 const statements=records.filter((r:any)=>r.kind==='Royalties'&&r.status==='Released');
 const payouts=records.filter((r:any)=>r.kind==='Payouts'&&!['Rejected','Cancelled'].includes(r.status));
 const number=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
 const earnings=statements.reduce((n:number,r:any)=>n+number(r.data.royaltyPaise),0);
 const reserved=payouts.reduce((n:number,r:any)=>n+number(r.data.amountPaise),0);
 return {records,books,sales,statements,payouts,earnings,reserved,balance:earnings-reserved,units:sales.reduce((n:number,r:any)=>n+number(r.data.units),0),published:books.filter((r:any)=>r.status==='Published'),drafts:books.filter((r:any)=>r.status!=='Published'),notifications:records.filter((r:any)=>r.kind==='Notifications'),unitsFor:(id:string)=>sales.filter((r:any)=>r.data.bookId===id).reduce((n:number,r:any)=>n+number(r.data.units),0)};
}
