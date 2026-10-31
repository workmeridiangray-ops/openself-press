// Presentation boundary only. Server-side role and record ownership checks remain authoritative.
export function portalData(source:any,operations:boolean){
 if(operations)return source;
 const records=(source.records||[]).filter((record:any)=>record.owner===source.user?.userId);
 const ids=new Set(records.map((record:any)=>record.id));
 return {...source,user:source.user?{...source.user,role:'author'}:undefined,members:[],records,history:(source.history||[]).filter((event:any)=>ids.has(event.record_id))};
}
