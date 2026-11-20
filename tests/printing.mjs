import ts from 'typescript';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const prepare=(query,args=[])=>({bind(...values){return prepare(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}});
const objects=new Map([['interior-v1','%PDF-1.4 synthetic interior'],['cover-v1','%PDF-1.4 synthetic cover']]);
globalThis.__env={DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const q of statements)results.push(await q.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}},BUCKET:{async head(key){return objects.has(key)?{}:null},async get(key){return objects.has(key)?{body:objects.get(key)}:null}},PRINTING_ENABLED:'1',PRINTING_SECRET:'synthetic-test-secret-at-least-32-characters'};
let identity={userId:'editor',email:'editor@example.test',displayName:'Editor'};globalThis.__getUser=async()=>identity;
const dir='.sites-runtime/printing-tests';mkdirSync(dir,{recursive:true});
const sources={business:'lib/business.ts',server:'lib/server.ts',providers:'lib/providers.ts','printing-contract':'lib/printing-contract.ts',printing:'lib/printing.ts',api:'app/api/printing/route.ts',file:'app/api/printing/files/route.ts',platform:'app/api/platform/route.ts',workflows:'app/api/workflows/route.ts',authorTools:'app/api/author-tools/route.ts','author-tools':'lib/author-tools.ts'};
for(const [name,path] of Object.entries(sources)){
 let source=readFileSync(path,'utf8').replace(/import \{books\} from '[^']+';/g,'const books=[];').replace(/import \{env\} from 'cloudflare:workers';/g,'const env=globalThis.__env;').replace(/import \{getApplicationUser\} from '[^']+';/g,'const getApplicationUser=globalThis.__getUser;');
 source=source.replace(/(['"])(?:\.\.?\/)+(?:lib\/)?(server|providers|business|printing-contract|printing|author-tools)\1/g,(_,q,name)=>q+'./'+name+'.mjs'+q);
 writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText);
}
const server=await import('../'+dir+'/server.mjs'),contract=await import('../'+dir+'/printing-contract.mjs'),printing=await import('../'+dir+'/printing.mjs'),api=await import('../'+dir+'/api.mjs'),files=await import('../'+dir+'/file.mjs'),platform=await import('../'+dir+'/platform.mjs'),providers=await import('../'+dir+'/providers.mjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};const throws=(fn,pattern)=>{assert.throws(fn,pattern);checks++};
await server.user();sql.prepare("UPDATE members SET role='admin'").run();
const config={size:'A5',paper:'Cream uncoated',gsm:80,blackPages:100,colourPages:0,lamination:'Matte',unitWeightGrams:150,approved:true};
eq(contract.printCost(config,1).totalPaise,7500);eq(contract.printCost(config,2).totalPaise,12600);eq(contract.printCost(config,3).totalPaise,20700);eq(contract.printCost(config,6).totalPaise,36000);
eq(contract.printCost({...config,size:'A4'},10).bindingPaise,4000);eq(contract.printCost({...config,size:'A4'},100).bindingPaise,3400);
eq(contract.printCost({...config,blackPages:501},1).unitPaise,25042);eq(contract.printCost({...config,blackPages:1001},1).unitPaise,44040);
eq(contract.printCost(config,2,'Hardcase').totalPaise,52000);eq(contract.printCost({...config,size:'A4'},1,'Hardcase').bindingPaise,25000);eq(contract.printProducts.Hardcase,14195);eq(contract.printProducts.Paperback,12982);
throws(()=>contract.printCost({...config,size:'B5'},1,'Hardcase'),/hardcase rate/);throws(()=>contract.printBinding('Spiral'),/Paperback and Hardcase/);
throws(()=>contract.printConfig({...config,size:'8x10'},100),/priced/);throws(()=>contract.printConfig({...config,blackPages:99},100),/equal/);throws(()=>contract.printConfig({...config,approved:false},100),/approve/);throws(()=>contract.printConfig({...config,unitWeightGrams:0},100),/weight/);
const reqPath='/api/printing/files?order=test&item=0&kind=interior';const signed=await contract.signedHeaders(__env.PRINTING_SECRET,'GET',reqPath,'');
eq(await contract.authenticatePrintRequest(new Request('https://openshelfpress.com'+reqPath,{headers:signed}),__env.PRINTING_SECRET),true);
eq(await contract.authenticatePrintRequest(new Request('https://openshelfpress.com'+reqPath+'x',{headers:signed}),__env.PRINTING_SECRET),false);
eq(await contract.authenticatePrintRequest(new Request('https://openshelfpress.com'+reqPath,{headers:signed}),__env.PRINTING_SECRET,Date.now()+301000),false);
const book=await server.create('author','Publishing','Published',{title:'Synthetic Dynamic GK test',binding:'Paperback',trimSize:'A5',pageCount:100,isbn:'9780306406157',proofAccepted:true,proofISBN:'9780306406157',printingConfig:config});
const interior=await server.create('author','Files','Approved',{bookReference:book,fileKey:'interior-v1',fileType:'application/pdf',filename:'interior.pdf'}),cover=await server.create('author','Cover design','Approved',{bookReference:book,fileKey:'cover-v1',fileType:'application/pdf',filename:'cover.pdf'});
await server.change(await server.record(book),'Published',{...(await server.record(book)).data,proofFiles:[{id:interior,version:1},{id:cover,version:1}]});
const listing=await server.create('editor','Catalogue','Published',{title:'Synthetic Dynamic GK test',pricePaise:24900,stock:10,bookReference:book});
const snapshot=await printing.snapshotPrintItems([{id:listing,qty:2}]);eq(snapshot[0].files.interior.key,'interior-v1');eq(snapshot[0].cost.totalPaise,12600);
const hardListing=await server.create('editor','Catalogue','Published',{title:'Synthetic hardcase',pricePaise:44900,stock:10,bookReference:book,binding:'Hardcase'});
const hard=await printing.snapshotPrintItems([{id:hardListing,qty:2}]);eq(hard[0].binding,'Hardcase');eq(hard[0].cost.totalPaise,52000);eq(snapshot[0].binding,'Paperback');
await rejects(()=>printing.snapshotPrintItems([{id:book,qty:1,binding:'Hardcase'}],true),/not published in the requested binding/);
let file=await server.record(cover);await server.change(file,'Approved',{...file.data,reviewProof:true});await rejects(()=>printing.snapshotPrintItems([{id:listing,qty:2}]),/exact author-approved/);
// Restore the synthetic fixture to the accepted version.
sql.prepare("UPDATE records SET status='Approved',version=1,data=? WHERE id=?").run(JSON.stringify(file.data),cover);
const address={name:'Synthetic Recipient',phone:'9000000000',address:'Synthetic test address',city:'Kolkata',state:'WB',pin:'700001',contactEmail:'reader@example.test'};
const place=async(key)=>{const res=await platform.POST(new Request('https://openshelfpress.com/api/platform',{method:'POST',headers:{origin:'https://openshelfpress.com','Content-Type':'application/json'},body:JSON.stringify({action:'create',kind:'Orders',data:{title:'Synthetic test order',requestKey:key,items:[{id:listing,qty:2}],...address}})}));const v=await res.json();eq(res.status,200);return v.id};
const order=await place('print-order');eq(await place('print-order'),order);eq((await server.record(listing)).data.stock,8);eq(sql.prepare('SELECT COUNT(*) n FROM printing_snapshots').get().n,1);
const locked=JSON.parse(sql.prepare('SELECT payload FROM printing_snapshots WHERE order_id=?').get(order).payload);eq(locked[0].files.cover.version,1);
await rejects(()=>printing.transferPrintJob(order),/paid/);
// Actual captured-payment handler, mocked provider only.
__env.RAZORPAY_KEY_ID='test';__env.RAZORPAY_KEY_SECRET='synthetic';let r=await server.record(order);await server.change(r,r.status,{...r.data,providerOrder:'rzp-order'});
let network=0,transfers=0,remoteRevision=1,remoteStage='Awaiting approval',remoteId=456,payloads=[],failResponse=false;
globalThis.fetch=async(url,options={})=>{
 network++;
 if(String(url).includes('api.razorpay.com'))return Response.json({id:'pay-synthetic',order_id:'rzp-order',currency:'INR',amount:54800,status:'captured'});
 if(String(url)==='https://onlineprintingz.in/wp-json/openshelf/v1/orders'){
  transfers++;const p=JSON.parse(options.body);payloads.push(p);
  assert(!options.body.includes('interior-v1'));assert(!options.body.includes('reader@example.test'));assert(!options.body.includes('249'));
  if(failResponse){failResponse=false;throw Error('Synthetic connection interrupted')}
  return Response.json({id:remoteId,sourceOrder:p.sourceOrder,payloadHash:await contract.digest(options.body)});
 }
 if(String(url)==='https://onlineprintingz.in/wp-json/openshelf/v1/orders/'+remoteId)return Response.json({id:remoteId,sourceOrder:order,revision:remoteRevision,stage:remoteStage,carrier:'Synthetic Carrier',tracking:'SYNTHETIC-AWB',trackingURL:'https://example.test/tracking'});
 throw Error('Unexpected external request: '+url);
};
await providers.capturePayment(await server.record(order),'pay-synthetic');eq((await server.record(order)).status,'Paid');eq((await printing.printJob(order)).state,'Queued');
await providers.capturePayment(await server.record(order),'pay-synthetic');eq(sql.prepare('SELECT COUNT(*) n FROM printing_jobs').get().n,1);
// Approved bytes remain tied to checkout even when the live file record changes later.
file=await server.record(interior);await server.change(file,'Uploaded',{...file.data,fileKey:'replacement-not-approved'});
failResponse=true;await rejects(()=>printing.transferPrintJob(order),/interrupted/);eq((await printing.printJob(order)).state,'Retry');
sql.prepare('UPDATE printing_jobs SET next_attempt=0').run();
await Promise.all([printing.transferPrintJob(order),printing.transferPrintJob(order)]);eq(transfers,2);eq((await printing.printJob(order)).remote_id,456);eq(payloads[0],payloads[1]);
await printing.transferPrintJob(order);eq(transfers,2);eq((await server.record(order)).data.printingStage,'Awaiting approval');
const downloadPath='/api/printing/files?order='+order+'&item=0&kind=interior';
eq((await files.GET(new Request('https://openshelfpress.com'+downloadPath))).status,403);
const response=await files.GET(new Request('https://openshelfpress.com'+downloadPath,{headers:await contract.signedHeaders(__env.PRINTING_SECRET,'GET',downloadPath,'')}));eq(response.status,200);eq(await response.text(),objects.get('interior-v1'));eq(response.headers.get('Cache-Control'),'private, no-store');
await printing.syncPrintJob(order);eq((await server.record(order)).status,'Paid');
remoteStage='In production';remoteRevision=2;await printing.syncPrintJob(order);eq((await server.record(order)).status,'In production');
remoteStage='Dispatched';remoteRevision=4;await printing.syncPrintJob(order);eq((await server.record(order)).status,'Dispatched');eq((await server.record(order)).data.tracking,'SYNTHETIC-AWB');
remoteStage='Ready to ship';remoteRevision=3;await printing.syncPrintJob(order);eq((await server.record(order)).status,'Dispatched');
remoteStage='Delivered';remoteRevision=5;await printing.syncPrintJob(order);eq((await server.record(order)).status,'Delivered');
throws(()=>contract.nextPrintStage('Ready to ship','Dispatched',{}),/carrier/);
identity={userId:'outsider',email:'outsider@example.test',displayName:'Other'};
eq((await api.GET(new Request('https://openshelfpress.com/api/printing'))).status,403);
eq((await api.POST(new Request('https://openshelfpress.com/api/printing',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}))).status,403);
eq((await api.POST(new Request('https://openshelfpress.com/api/printing',{method:'POST',headers:{origin:'https://openshelfpress.com'},body:JSON.stringify({action:'sync',id:order})}))).status,400);
// Stage notices are one-per-revision, including duplicate polling.
const noticeCount=sql.prepare("SELECT COUNT(*) n FROM records WHERE id LIKE 'print-notice-%'").get().n;
await printing.syncPrintJob(order);eq(sql.prepare("SELECT COUNT(*) n FROM records WHERE id LIKE 'print-notice-%'").get().n,noticeCount);eq(noticeCount,4);
// Author-copy orders get their snapshot in the same database transaction.
sql.prepare("UPDATE records SET status='Approved',version=1,data=? WHERE id=?").run(JSON.stringify({...file.data,fileKey:'interior-v1'}),interior);
identity={userId:'author',email:'author@example.test',displayName:'Author'};await server.user();
const finalFiles=[{id:interior,version:1,filename:'interior.pdf',kind:'Files'},{id:cover,version:1,filename:'cover.pdf',kind:'Cover design'}];
const service=await server.create('author','Services','Accepted',{title:'Synthetic author copies',requestType:'Author copies',quotePaise:18000,bookReference:book,quantity:2,finalFiles,...address,recipientType:'Myself',binding:'Paperback'});
const authorAPI=await import('../'+dir+'/authorTools.mjs');
const copyReq=id=>new Request('https://openshelfpress.com/api/author-tools',{method:'POST',headers:{origin:'https://openshelfpress.com'},body:JSON.stringify({action:'copy-order',id})});
let copyRes=await authorAPI.POST(copyReq(service));assert.equal(copyRes.status,200,JSON.stringify(await copyRes.clone().json()));checks++;const copyId=(await copyRes.json()).id;
eq((await server.record(copyId)).status,'Awaiting payment');eq(JSON.parse(sql.prepare('SELECT payload FROM printing_snapshots WHERE order_id=?').get(copyId).payload)[0].copies,2);
eq((await authorAPI.POST(copyReq(service))).status,200);
const failingService=await server.create('author','Services','Accepted',{...(await server.record(service)).data});
sql.prepare('INSERT INTO printing_snapshots VALUES(?,?,?)').run('copies-'+failingService,'[]',new Date().toISOString());
copyRes=await authorAPI.POST(copyReq(failingService));eq(copyRes.status,400);eq(sql.prepare('SELECT id FROM records WHERE id=?').get('copies-'+failingService),undefined);
// Missing stored PDFs block transfer without contacting WordPress.
let cop=await server.record(copyId);await printing.markPrintPaid(cop,{...cop.data,paymentId:'synthetic-external',paymentMethod:'Verified external payment'});
objects.delete('cover-v1');const callsBeforeMissing=network;await rejects(()=>printing.transferPrintJob(copyId),/PDF is missing/);eq(network,callsBeforeMissing);objects.set('cover-v1','%PDF-1.4 synthetic cover');
sql.prepare('UPDATE printing_jobs SET next_attempt=0,attempts=7 WHERE order_id=?').run(copyId);
failResponse=true;await rejects(()=>printing.transferPrintJob(copyId),/interrupted/);eq((await printing.printJob(copyId)).state,'Review');
__env.PRINTING_ENABLED='0';const before=network;eq((await printing.runPrintQueue()).disabled,true);eq(network,before);
console.log(`${checks} printing connector checks passed; all provider HTTP calls mocked`);
