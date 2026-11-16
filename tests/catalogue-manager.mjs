import ts from 'typescript';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const database=new DatabaseSync(':memory:');
for(const path of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+path,'utf8'));
const statement=(sql,args=[])=>({bind(...values){return statement(sql,values);},async first(){return database.prepare(sql).get(...args)||null;},async all(){return {results:database.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(database.prepare(sql).run(...args).changes)}};}});
let identity=null;globalThis.__getUser=async()=>identity;
const files=new Map();globalThis.__env={DB:{prepare:statement,async batch(queries){database.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.run());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}},BUCKET:{async put(key,bytes,options){files.set(key,{body:bytes,...options});},async get(key){return files.get(key);}}};
const dir='.sites-runtime/catalogue-tests';mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/auth.mjs',"import {createHash} from 'node:crypto'; export const getApplicationUser=()=>globalThis.__getUser();export const digest=s=>createHash('sha256').update(s).digest('hex');");
for(const [name,path] of Object.entries({packageModel:'lib/catalogue-package.ts',packageAPI:'app/api/admin/catalogue/package/route.ts',model:'lib/catalogue-import.ts',server:'lib/server.ts',api:'app/api/admin/catalogue/route.ts',cover:'app/api/catalogue/cover/route.ts',public:'app/api/catalogue/route.ts',platform:'app/api/platform/route.ts'})){
  let source=readFileSync(path,'utf8').replace(/import \{env\} from 'cloudflare:workers';/g,'const env=globalThis.__env;')
    .replace(/from '(?:\.\.\/)*lib\/server'/g,"from './server.mjs'")
    .replace(/from '(?:\.\.\/)*lib\/author-auth'/g,"from './auth.mjs'")
    .replace(/from '\.\/author-auth'/g,"from './auth.mjs'")
    .replace(/from '(?:\.\.\/)*lib\/catalogue-import'/g,"from './model.mjs'")
    .replace(/from '(?:\.\.\/)*lib\/catalogue-package'/g,"from './packageModel.mjs'")
    .replace(/from '\.\/catalogue-import'/g,"from './model.mjs'")
    .replace(/import \{books\} from '[^']+';/g,"const books=[{id:'builtin',title:'Built-in book'}];");
  writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const model=await import('../'+dir+'/model.mjs'),api=await import('../'+dir+'/api.mjs'),publicAPI=await import('../'+dir+'/public.mjs'),coverAPI=await import('../'+dir+'/cover.mjs'),platformAPI=await import('../'+dir+'/platform.mjs');
const origin='https://catalogue.test';let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
async function post(body,status=200,requestOrigin=origin){const response=await api.POST(new Request(origin+'/api/admin/catalogue',{method:'POST',headers:{origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)}));const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));checks++;return result;}
async function all(){return (await (await api.GET()).json()).books;}
async function storefront(){return (await (await publicAPI.GET()).json()).books;}
async function signIn(role){identity={userId:role,email:role+'@example.test',displayName:role,authMethod:'chatgpt'};database.prepare('INSERT OR REPLACE INTO members VALUES(?,?,?)').run(role,identity.email,role);}
const book=(extra={})=>({title:'The Test Shelf',author:'Test Writer',sku:'TEST-1',price:'299.50',stock:'12',cover:'https://example.test/front.jpg',description:'A test book.',language:'Hindi',binding:'Paperback',pageCount:'120',trimSize:'A5',publishedAt:'2026-11-16',...extra});
const save=(values,status='Draft',extra={})=>({action:'save',...values,status,rightsConfirmed:true,...extra});
eq((await api.GET()).status,401);await post(save(book()),401);
await signIn('author');eq((await api.GET()).status,403);await post(save(book()),403);
await signIn('staff');await post(save(book()),403,'https://attacker.test');await post(save(book()),403,'');
// CSV fidelity and rejection paths matter for descriptions exported from spreadsheets.
const csv='\uFEFFBook title,Author name,Price INR,Stock,Description\r\n"A, B",Writer,299.50,3,"Line one\nLine ""two"""\r\n';
const parsed=model.parseBookCSV(csv);eq(parsed[0].title,'A, B');eq(parsed[0].description,'Line one\nLine "two"');
for(const text of ['title,author,price,stock\n"broken,Writer,1,1','title,title,price,stock\nA,A,1,1','title,author,price,stock\nA,B,1','title,author,price,stock\nA,B,1,1,extra','title,author,price,stock,secret\nA,B,1,1,x']){assert.throws(()=>model.parseBookCSV(text));checks++;}
assert.throws(()=>model.parseBookCSV('title,author,price,stock\n'+Array.from({length:201},(_,i)=>`Book ${i},Writer,100,1`).join('\n')));checks++;
eq(model.csvText([['=HYPERLINK("bad")','+formula','@formula','-formula']]).includes('"\'=HYPERLINK'),true);
assert.throws(()=>model.normalizeCatalogueBook(book({price:'1.005'}),'Published'));checks++;
assert.throws(()=>model.normalizeCatalogueBook(book({stock:'-1'}),'Published'));checks++;
assert.throws(()=>model.normalizeCatalogueBook(book({isbn:'9780000000000'}),'Published'));checks++;
assert.throws(()=>model.normalizeCatalogueBook(book({publishedAt:'2026-02-30'}),'Published'));checks++;
eq(model.validISBN('9780306406157'),true);eq(model.validISBN('0306406152'),true);
// A new draft is stored, but never projected publicly or turned into a manuscript project.
let result=await post(save(book()));let first=(await all())[0];eq(first.id,result.id);eq(first.status,'Draft');eq((await storefront()).length,0);eq(database.prepare("SELECT count(*) n FROM records WHERE kind='Publishing'").get().n,0);
await post(save(book(),'Published',{id:first.id,version:first.version,rightsConfirmed:false}),400);
await post(save(book(),'Published',{id:first.id,version:first.version}));
let live=(await storefront())[0];eq(live.title,'The Test Shelf');eq(live.price,299.5);eq(live.language,'Hindi');eq(live.pageCount,120);eq(live.coverKey,undefined);eq(live.sku,undefined);
// Direct listings use existing checkout pricing and stock reservation, not client-supplied prices.
await signIn('author');const checkout=await platformAPI.POST(new Request(origin+'/api/platform',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'create',kind:'Orders',data:{title:'Test order',items:[{id:live.id,qty:1,price:1}],name:'Test Reader',contactEmail:'reader@example.test',address:'Fixture address',city:'Kolkata',state:'WB',pin:'700001',requestKey:'catalogue-test-order',total:1}})}));eq(checkout.status,200);const checkoutResult=await checkout.json();eq(JSON.parse(database.prepare('SELECT data FROM records WHERE id=?').get(checkoutResult.id).data).items[0].price,299.5);await signIn('staff');
await post(save(book(),'Draft',{id:first.id,version:first.version}),409);
first=(await all())[0];await post(save(book({price:'325',stock:'8'}),'Published',{id:first.id,version:first.version}));eq((await storefront())[0].price,325);
await post(save(book()),409);await post(save(book({sku:'test-1',title:'Another title'})),409);
first=(await all())[0];await post(save(book(),'Archived',{id:first.id,version:first.version}));eq((await storefront()).length,0);
// Bulk preview is read-only; import is all-or-nothing and revalidates on commit.
const rows=[book({sku:'BULK-1',title:'Bulk One'}),book({sku:'BULK-2',title:'Bulk Two'})];
const before=(await all()).length;result=await post({action:'preview',rows,status:'Published'});eq(result.valid,2);eq((await all()).length,before);
result=await post({action:'preview',rows:[...rows,rows[0]],status:'Published'});eq(result.valid,2);eq(result.rows[2].error,'Duplicate book in this upload.');
await post({action:'import',rows:[rows[0],book({sku:'BAD',stock:'oops'})],status:'Published',rightsConfirmed:true},400);eq((await all()).length,before);
await post({action:'import',rows,status:'Published',rightsConfirmed:false},400);
result=await post({action:'import',rows,status:'Published',rightsConfirmed:true});eq(result.count,2);eq((await storefront()).length,2);
await post({action:'import',rows,status:'Published',rightsConfirmed:true},400);eq((await all()).length,before+2);
// Simulate another writer claiming an ID after validation. D1's batch must roll back the first row too.
const realBatch=__env.DB.batch;
const raceRows=[book({sku:'RACE-1',title:'Race One'}),book({sku:'RACE-2',title:'Race Two'})];
__env.DB.batch=async queries=>{const normalized=model.normalizeCatalogueBook(raceRows[1],'Draft');const id='catalogue-'+createHash('sha256').update(model.bookIdentity(normalized)).digest('hex');database.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').run(id,'staff','Catalogue','Draft',JSON.stringify(normalized),'t','t');return realBatch(queries);};
await post({action:'import',rows:raceRows,status:'Draft'},409);__env.DB.batch=realBatch;
eq((await all()).some(r=>r.data.sku==='RACE-1'),false);
// Dedicated covers accept raster formats only, and private files cannot be made public by key injection.
const upload=async(file,status)=>{const form=new FormData();form.set('file',file);const res=await api.POST(new Request(origin+'/api/admin/catalogue',{method:'POST',headers:{origin},body:form}));eq(res.status,status);return res.json();};
await upload(new File(['<svg onload="alert(1)"></svg>'],'cover.svg',{type:'image/svg+xml'}),400);
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);result=await upload(new File([png],'front.png',{type:'image/png'}),200);const coverKey=result.coverKey;
await post(save(book({sku:'PRIVATE',title:'Private key',cover:'',coverKey:'author/private-manuscript'})),400);
result=await post(save(book({sku:'COVER',title:'Uploaded cover',cover:'',coverKey})));const uploaded=(await all()).find(r=>r.id===result.id);
identity=null;eq((await coverAPI.GET(new Request(origin+uploaded.data.cover))).status,404);
await signIn('staff');eq((await coverAPI.GET(new Request(origin+uploaded.data.cover))).status,200);
await post(save({...uploaded.data,price:'299.50'},'Published',{id:uploaded.id,version:uploaded.version}));identity=null;eq((await coverAPI.GET(new Request(origin+uploaded.data.cover))).status,200);
// Production-linked records retain their original approval requirement.
await signIn('admin');database.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').run('edition','author','Publishing','Draft','{"title":"Edition"}','t','t');database.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,1)').run('linked','admin','Catalogue','Draft',JSON.stringify({...book({sku:'LINKED'}),pricePaise:29950,bookReference:'edition'}),'t','t');
await post(save(book({sku:'LINKED'}),'Published',{id:'linked',version:1}),400);
eq(database.prepare('SELECT status FROM records WHERE id=?').get('edition').status,'Draft');
database.prepare("UPDATE records SET status='Archived' WHERE kind='Catalogue'").run();await signIn('author');const blocked=await platformAPI.POST(new Request(origin+'/api/platform',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'create',kind:'Orders',data:{title:'Fallback order',items:[{id:'builtin',qty:1}]}})}));eq(blocked.status,400);eq((await blocked.json()).error,'The bookstore is not open for orders yet.');
console.log(`${checks} catalogue permissions, CSV, publication, import atomicity, cover and production-boundary checks passed`);
const packageAPI=await import('../'+dir+'/packageAPI.mjs');
async function pkg(body,status=200){const r=await packageAPI.POST(new Request(origin+'/api/admin/catalogue/package',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));const d=await r.json();eq(r.status,status);return d;}
await signIn('author');await pkg({action:'preview',rows:[]},403);await signIn('admin');
const packageRows=[book({sku:'PKG-1',title:'Package One',price:'208.80',printingCost:'58.80',stock:'0',isbn:'',cover:'',coverData:'data:image/png;base64,'+Buffer.from(png).toString('base64')})];
let plan=await pkg({action:'preview',rows:packageRows});eq(plan.valid,1);eq((await all()).some(r=>r.data.sku==='PKG-1'),false);
await pkg({action:'apply',rows:packageRows,versions:{'PKG-1':9}},409);
result=await pkg({action:'apply',rows:packageRows,versions:{'PKG-1':0}});eq(result.count,1);
let packaged=(await all()).find(r=>r.data.sku==='PKG-1');eq(packaged.status,'Draft');eq(packaged.data.printingCostPaise,5880);eq(packaged.data.markupPaise,15000);eq(packaged.data.isbn,'');eq(!!packaged.data.coverKey,true);
const updates=[{...packageRows[0],author:'Changed credit',stock:'999',price:'220',coverData:undefined}];
plan=await pkg({action:'preview',rows:updates});await pkg({action:'apply',rows:updates,versions:{'PKG-1':plan.rows[0].version}});
packaged=(await all()).find(r=>r.data.sku==='PKG-1');eq(packaged.data.author,'Test Writer');eq(packaged.data.stock,0);eq(!!packaged.data.coverKey,true);eq((await all()).filter(r=>r.data.sku==='PKG-1').length,1);
plan=await pkg({action:'preview',rows:[...packageRows,...packageRows]});eq(plan.valid,1);
for(const bad of [{title:'Wrong title'},{coverData:'data:image/png;base64,PHN2Zz4='},{price:'1'}]){plan=await pkg({action:'preview',rows:[{...packageRows[0],...bad}]});eq(plan.valid,0);}
plan=await pkg({action:'preview',rows:[book({sku:'LINKED',printingCost:'50'})]});eq(plan.valid,0);
const beforeArtwork={...packaged.data};
const artwork=[{sku:'PKG-1',title:'Package One',coverOnly:true,coverData:packageRows[0].coverData,price:'1',stock:'999',isbn:'9780306406157',printingCost:'999',author:'Wrong credit'}];
plan=await pkg({action:'preview',rows:artwork});eq(plan.valid,1);
await pkg({action:'apply',rows:artwork,versions:{'PKG-1':plan.rows[0].version}});
packaged=(await all()).find(r=>r.data.sku==='PKG-1');
for(const key of ['pricePaise','printingCostPaise','markupPaise','stock','isbn','title','author'])eq(packaged.data[key],beforeArtwork[key]);
eq(packaged.data.coverKey!==beforeArtwork.coverKey,true);
plan=await pkg({action:'preview',rows:[{...artwork[0],sku:'MISSING'}]});eq(plan.valid,0);
plan=await pkg({action:'preview',rows:[{...artwork[0],coverData:''}]});eq(plan.valid,0);
await post(save({...packaged.data,price:'220'},'Published',{id:packaged.id,version:packaged.version}));
plan=await pkg({action:'preview',rows:packageRows});eq(plan.valid,0);
const projected=(await storefront()).find(r=>r.id===packaged.id);eq(projected.printingCostPaise,undefined);eq(projected.markupPaise,undefined);
console.log(`${checks} total catalogue and package checks passed`);

// Inventory-only packages preserve publication state and all other saved metadata.
const beforeInventory={...packaged.data};
const stockRows=[{sku:'PKG-1',title:'Package One',stockOnly:true,stock:10,price:'1',isbn:'',author:'Wrong credit'}];
plan=await pkg({action:'preview',rows:stockRows});eq(plan.valid,1);eq(plan.rows[0].stock,10);
await pkg({action:'apply',rows:stockRows,versions:{'PKG-1':plan.rows[0].version}});
packaged=(await all()).find(r=>r.data.sku==='PKG-1');eq(packaged.status,'Published');eq(packaged.data.stock,10);
for(const key of ['pricePaise','printingCostPaise','markupPaise','coverKey','isbn','author','title'])eq(packaged.data[key],beforeInventory[key]);
for(const stock of [-1,1.5,1000001]){plan=await pkg({action:'preview',rows:[{...stockRows[0],stock}]});eq(plan.valid,0);}
plan=await pkg({action:'preview',rows:[{...stockRows[0],sku:'DOES-NOT-EXIST'}]});eq(plan.valid,0);
plan=await pkg({action:'preview',rows:[{...stockRows[0],title:'Wrong title'}]});eq(plan.valid,0);
console.log(`${checks} total catalogue, cover and inventory package checks passed`);

// Author-only updates change exactly the author credit of direct draft listings.
await post(save(book({sku:'CREDIT-1',title:'Credit Test'})));
const creditBook=(await all()).find(r=>r.data.sku==='CREDIT-1');
const beforeCredit={...creditBook.data};
const credits=[{sku:'CREDIT-1',title:creditBook.data.title,authorOnly:true,author:'Koko Nest',stock:999,price:'1',isbn:'9780306406157'}];
plan=await pkg({action:'preview',rows:credits});eq(plan.valid,1);eq(plan.rows[0].author,'Koko Nest');
await pkg({action:'apply',rows:credits,versions:{'CREDIT-1':plan.rows[0].version}});
const credited=(await all()).find(r=>r.id===creditBook.id);eq(credited.status,'Draft');eq(credited.data.author,'Koko Nest');
for(const key of Object.keys(beforeCredit).filter(k=>k!=='author'))eq(credited.data[key],beforeCredit[key]);
for(const author of ['', 'x'.repeat(201)]){plan=await pkg({action:'preview',rows:[{...credits[0],author}]});eq(plan.valid,0);}
plan=await pkg({action:'preview',rows:[{...credits[0],sku:'MISSING'}]});eq(plan.valid,0);
console.log(`${checks} total catalogue package checks passed`);
