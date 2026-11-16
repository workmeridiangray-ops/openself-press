import {normalizeCatalogueBook} from './catalogue-import';
export const PACKAGE_LIMIT=50;
export function packageCover(value:unknown){
  if(!value)return null;
  if(typeof value!=='string'||value.length>700000)throw Error('Each packaged cover must be smaller than 500 KB.');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw Error('Use a PNG, JPEG or WebP cover.');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(match[1]==='image/png'?png:match[1]==='image/jpeg'?jpeg:webp))throw Error('Cover content does not match its image format.');
  return {bytes,mime:match[1]};
}
export function preparePackage(rows:any[],existing:any[]){
  if(!Array.isArray(rows)||!rows.length||rows.length>PACKAGE_LIMIT)throw Error('Use between 1 and '+PACKAGE_LIMIT+' books per package.');
  const seen=new Set<string>();
  return rows.map((input,index)=>{try{
    const sku=String(input.sku||'').trim();if(!sku)throw Error('A book code / SKU is required.');
    if(seen.has(sku.toLowerCase()))throw Error('Duplicate book code in this package.');seen.add(sku.toLowerCase());
    const matches=existing.filter(r=>String(r.data.sku||'').trim().toLowerCase()===sku.toLowerCase());
    if(matches.length>1)throw Error('Multiple listings share this code. Resolve them before updating.');
    const prior=matches[0];
    if(prior&&(prior.status!=='Draft'||prior.data.bookReference))throw Error('Only direct draft listings can be updated with a package.');
    if(prior&&String(prior.data.title).trim()!==String(input.title).trim())throw Error('The title does not match the saved book code.');
    const cover=packageCover(input.coverData);
    if(input.coverOnly===true){
      if(!prior)throw Error('Cover-only updates require an existing draft book.');
      if(!cover)throw Error('Attach cover artwork for a cover-only update.');
      // Preserve the saved record exactly; cover-only packages cannot change pricing or metadata.
      return {row:index+1,sku,title:prior.data.title,data:{...prior.data},prior,cover,error:''};
    }
    const cost=String(input.printingCost??'');if(!/^\d+(\.\d{1,2})?$/.test(cost)||Number(cost)>1_000_000)throw Error('Enter a valid printing cost.');
    const merged=prior?{...prior.data,price:input.price,isbn:input.isbn??prior.data.isbn}:input;
    const data:any=normalizeCatalogueBook(merged,'Draft',!!cover||!!prior?.data.coverKey);
    const printingCostPaise=Math.round(Number(cost)*100);
    if(data.pricePaise<printingCostPaise)throw Error('Retail price must be at least the printing cost.');
    if(!prior&&existing.some(r=>r.data.title===data.title&&r.data.author===data.author))throw Error('A matching title already exists under another code.');
    Object.assign(data,{printingCostPaise,markupPaise:data.pricePaise-printingCostPaise,costBasis:String(input.costBasis||'').slice(0,500),listingSource:'direct'});
    if(prior)Object.assign(data,{cover:prior.data.cover,coverKey:prior.data.coverKey});
    return {row:index+1,sku,title:data.title,data,prior,cover,error:''};
  }catch(e:any){return {row:index+1,sku:String(input?.sku||''),title:String(input?.title||''),error:e.message};}});
}
