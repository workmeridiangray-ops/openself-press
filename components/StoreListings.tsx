'use client';
import React from 'react';
export type StoreRow={channel:string,url?:string,format?:string,price?:string,royaltyPaise?:number|null,royaltyEstimate?:boolean,logoDomain?:string,status?:string,region?:string,order?:number};
const inr=(p:number)=>'₹'+Math.round(p/100).toLocaleString('en-IN');
const logo=(d?:string)=>d==='openshelfpress.com'?'/brand/app-icon.png':'https://www.google.com/s2/favicons?sz=64&domain='+encodeURIComponent(d||'');
export function fromDistribution(records:any[],bookId:string):StoreRow[]{return records.filter((r:any)=>r.kind==='Distribution'&&r.data.bookId===bookId&&r.status!=='Removed').map((r:any)=>({channel:r.data.channel,url:r.data.listingURL,format:r.data.format,price:r.data.price,royaltyPaise:r.data.royaltyPaise,royaltyEstimate:r.data.royaltyEstimate,logoDomain:r.data.logoDomain,status:r.status,region:r.data.region,order:r.data.order??99})).sort((a,b)=>(a.order??99)-(b.order??99))}
export default function StoreListings({rows,royalty=false,title='Where your book is sold'}:{rows:StoreRow[],royalty?:boolean,title?:string}){
  if(!rows.length)return null;
  const groups:[string,StoreRow[]][]=[['India',rows.filter(r=>r.region==='India')],['International',rows.filter(r=>r.region!=='India')]];
  return <section style={{marginTop:18}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,flexWrap:'wrap',marginBottom:12}}><h3 style={{margin:0,fontSize:17}}>{title}</h3>{royalty&&<small className="muted">{rows.filter(r=>r.status==="Listed").length} live · {rows.filter(r=>r.status!=="Listed").length} in review at the store</small>}</div>
    {groups.filter(([,g])=>g.length).map(([name,g])=><div key={name} style={{marginBottom:16}}>
      <p className="eyebrow" style={{margin:'4px 0 8px'}}>{name.toUpperCase()}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:10}}>
      {g.map(r=>{const live=r.status==='Listed';const Card:any=r.url?'a':'div';return <Card key={r.channel} href={r.url} target="_blank" rel="noopener noreferrer" style={{display:'flex',gap:12,alignItems:'center',padding:'12px 14px',border:'1px solid var(--line)',borderRadius:10,background:'#fff',color:'inherit',textDecoration:'none'}}>
        <img src={logo(r.logoDomain)} alt="" width={32} height={32} style={{borderRadius:8,flexShrink:0,background:'#f6f4f0',padding:3}}/>
        <span style={{flex:1,minWidth:0}}>
          <strong style={{display:'block',fontSize:13,lineHeight:1.3}}>{r.channel}{r.url?' ↗':''}</strong>
          <small style={{display:'block',color:'var(--muted)',fontSize:11}}>{[r.format,r.price].filter(Boolean).join(' · ')||' '}</small>
          {royalty&&r.royaltyPaise?<small style={{display:'block',fontSize:11,color:'#2f6b4f',fontWeight:600}}>You earn {r.royaltyEstimate?'~':''}{inr(r.royaltyPaise)}/copy{r.royaltyEstimate?' (est.)':''}</small>:null}
        </span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:20,whiteSpace:'nowrap',background:live?'#e3f3ea':'#f6efe1',color:live?'#2f6b4f':'#8a6a2f'}}>{live?'Live':'In review'}</span>
      </Card>})}
      </div></div>)}
    {royalty&&<p className="muted" style={{fontSize:11,margin:'4px 0 0'}}>Amounts marked “est.” are averages for international stores and vary by country, currency and store pricing. Final earnings appear in your royalty statements.</p>}
  </section>;
}
