export const IMPORT_LIMIT = 200;
export const CSV_COLUMNS = ['sku','title','author','price','stock','genre','description','cover','isbn','language','binding','pageCount','trimSize','subtitle','tag','publishedAt'];
const aliases:Record<string,string> = {booktitle:'title',authorname:'author',priceinr:'price',retailprice:'price',coverurl:'cover',coverimageurl:'cover',pages:'pageCount',pagecount:'pageCount',trimsize:'trimSize',publicationdate:'publishedAt',publishedat:'publishedAt',isbn13:'isbn'};
const headerKey = (s:string) => s.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[ _()-]/g,'');

/** RFC 4180-style CSV, including escaped quotes, CRLF and multiline descriptions. */
export function parseBookCSV(text:string):Record<string,string>[] {
  if(text.length>2_000_000)throw Error('Use a CSV file smaller than 2 MB.');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
  const endCell=()=>{row.push(cell);cell='';closed=false};
  const endRow=()=>{endCell();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>IMPORT_LIMIT+1)throw Error('Import up to '+IMPORT_LIMIT+' books at a time.');};
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c===','){endCell();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
    if(c==='"'){if(cell||closed)throw Error('Invalid quote in CSV row '+(rows.length+1)+'.');quoted=true;continue;}
    if(closed){if(c===' '||c==='\t')continue;throw Error('Unexpected text after a closing quote in CSV row '+(rows.length+1)+'.');}
    cell+=c;
  }
  if(quoted)throw Error('A quoted CSV field is missing its closing quote.');
  if(cell||row.length||closed)endRow();
  if(rows.length<2)throw Error('Add a header row and at least one book.');
  const columns=rows.shift()!.map(s=>{const key=headerKey(s);return aliases[key]||CSV_COLUMNS.find(c=>headerKey(c)===key)||'';});
  if(columns.some(c=>!c))throw Error('An unknown column was found. Use the downloadable CSV template.');
  if(new Set(columns).size!==columns.length)throw Error('CSV column names must be unique.');
  for(const required of ['title','author','price','stock'])if(!columns.includes(required))throw Error('Missing column: '+required);
  return rows.map((values,i)=>{if(values.length!==columns.length)throw Error('CSV row '+(i+2)+' has '+values.length+' fields; expected '+columns.length+'.');return Object.fromEntries(columns.map((key,j)=>[key,values[j].trim()]));});
}

export function csvText(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function validISBN(value:string){const s=value.replace(/[-\s]/g,'');if(/^\d{13}$/.test(s))return /^97[89]/.test(s)&&[...s].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0)%10===0;if(/^\d{9}[\dX]$/i.test(s))return [...s.toUpperCase()].reduce((n,c,i)=>n+(c==='X'?10:Number(c))*(10-i),0)%11===0;return false;}
export function bookIdentity(data:any){return String(data.sku||'').trim()? 'sku:'+String(data.sku).trim().toLowerCase():data.isbn?'isbn:'+String(data.isbn).replace(/[-\s]/g,'').toUpperCase():'book:'+String(data.title||'').trim().toLowerCase()+'|'+String(data.author||'').trim().toLowerCase()+'|'+String(data.binding||'Paperback').trim().toLowerCase();}

export function normalizeCatalogueBook(input:any,status:string,hasUploadedCover=false){
  const text=(key:string,max:number)=>{const value=String(input[key]??'').trim();if(value.length>max)throw Error(key+' must be at most '+max+' characters.');return value;};
  const title=text('title',200),author=text('author',200),sku=text('sku',80);
  if(!title||!author)throw Error('Book title and author are required.');
  if(!['Draft','Published','Archived'].includes(status))throw Error('Choose Draft, Published or Archived.');
  const price=String(input.price??'').trim();if(!/^\d+(\.\d{1,2})?$/.test(price)||Number(price)>1_000_000)throw Error('Enter a price in rupees with up to two decimal places.');
  const stock=String(input.stock??'').trim();if(!/^\d+$/.test(stock)||!Number.isSafeInteger(Number(stock))||Number(stock)>1_000_000)throw Error('Stock must be a whole number from 0 to 1,000,000.');
  const cover=text('cover',2000);if(cover&&!cover.startsWith('/api/catalogue/cover?')){try{const u=new URL(cover);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{throw Error('Use an HTTPS cover image URL or upload a cover.');}}
  const isbn=text('isbn',32).replace(/[-\s]/g,'').toUpperCase();if(isbn&&!validISBN(isbn))throw Error('Enter a valid ISBN-10 or ISBN-13, or leave ISBN blank.');
  const pageCount=text('pageCount',8);if(pageCount&&(!/^\d+$/.test(pageCount)||Number(pageCount)<1||Number(pageCount)>100000))throw Error('Page count must be a positive whole number.');
  const publishedAt=text('publishedAt',10);if(publishedAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)||!Number.isFinite(Date.parse(publishedAt))||new Date(publishedAt).toISOString().slice(0,10)!==publishedAt))throw Error('Publication date must be a valid YYYY-MM-DD date.');
  if(status==='Published'&&(!cover&&!hasUploadedCover||Number(price)<=0))throw Error('Publishing requires a cover and a price greater than zero.');
  return {sku,title,author,pricePaise:Math.round(Number(price)*100),stock:Number(stock),genre:text('genre',100)||'General',description:text('description',10000),cover,isbn,language:text('language',80)||'English',binding:text('binding',80)||'Paperback',pageCount:pageCount?Number(pageCount):undefined,trimSize:text('trimSize',80),subtitle:text('subtitle',200),tag:text('tag',200),publishedAt,color:/^#[a-f0-9]{6}$/i.test(input.color||'')?input.color:'#dce4d1',accent:'#284f43'};
}
