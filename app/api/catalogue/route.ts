import {list,record,settings,reply} from '../../../lib/server';
import {books} from '../../../lib/catalogue';
export const dynamic='force-dynamic';
export async function GET(){try{
  const listings=await list('Catalogue');const dist=await list('Distribution');
  const catalogue=await Promise.all(listings.filter(r=>r.status==='Published').map(async r=>{
    let edition:any={};
    if(r.data.bookReference){try{const source=await record(r.data.bookReference);if(source.kind==='Publishing')edition=source.data;}catch{}}
    const data=r.data;
    return {id:r.id,title:data.title,subtitle:data.subtitle,author:data.author,genre:data.genre,description:data.description,tag:data.tag,cover:data.cover,color:data.color,accent:data.accent,price:data.pricePaise/100,stock:data.stock,bookReference:data.bookReference,isbn:edition.isbn||data.isbn,language:edition.language||data.language,binding:edition.binding||data.binding,trimSize:edition.trimSize||data.trimSize,pageCount:edition.pageCount||data.pageCount,publishedAt:edition.publishedAt||data.publishedAt,stores:dist.filter((x:any)=>x.data.bookId===r.data.bookReference&&x.status==='Listed'&&!/openshelfpress/.test(x.data.logoDomain||'')).map((x:any)=>({channel:x.data.channel,url:x.data.listingURL,format:x.data.format,price:x.data.price,logoDomain:x.data.logoDomain,status:x.status,region:x.data.region,order:x.data.order}))};
  }));
  // Author and restored titles first; the Koko Nest house catalogue always comes last.
  const rank=(b:any)=>/^koko nest$/i.test(String(b.author||'').trim())?2:String(b.id).startsWith('catalogue-restored-')?1:0;
  catalogue.sort((a:any,b:any)=>rank(a)-rank(b));
  const config=await settings();
  // Once staff manage a catalogue, archiving its last book must not restore built-in books.
  const sample=!listings.length&&!config.launchReady;
  return reply({books:sample?books:catalogue,sample,settings:config});
}catch{return reply({books:[],sample:false,error:'The catalogue is temporarily unavailable.'},503);}}
