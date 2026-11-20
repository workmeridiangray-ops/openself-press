/* eslint-disable @typescript-eslint/no-explicit-any -- Private test records and provider JSON. */
import {db,secrets,record,create,change,audit} from './server';
import {digest,signedHeaders,printCost,printConfig,printStages} from './printing-contract';

export const TEST_ISBN='9780000000002'; // Checksum-valid placeholder, never an ISBN allocation.
export const testId=(id:string)=>/^osp-test-[a-f0-9-]{36}$/.test(id);
const now=()=>new Date().toISOString();

/** Minimal deterministic PDF; contains synthetic test text only. */
export function testPDF(kind:'interior'|'cover') {
  const count=kind==='interior'?42:1,objects:string[]=[];
  const add=(s:string)=>{objects.push(s);return objects.length};
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pages:number[]=[];
  for(let i=1;i<=count;i++){
    const text=`BT /F1 18 Tf 50 730 Td (TEST ONLY - DO NOT PRINT OR SHIP) Tj 0 -35 Td (OpenShelf connector ${kind} - page ${i}) Tj 0 -35 Td (Placeholder ISBN ${TEST_ISBN} - not allocated) Tj ET`;
    const stream=add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    pages.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${pages.map(n=>n+' 0 R').join(' ')}] >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((s,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${s}\nendobj\n`});
  const start=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  return pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
}

async function request(method:string,path:string,body='') {
  const secret=secrets().PRINTING_SECRET;
  if(!secret||secret.length<32)throw Error('Configure PRINTING_SECRET before running a test');
  // Test callers cannot choose a destination, arbitrary route, or source data.
  if(!/^\/(test-capabilities|orders|orders\/\d+|test-orders\/\d+\/(check|stage|cancel))$/.test(path))throw Error('Invalid test route');
  const route='/wp-json/openshelf/v1'+path;
  const response=await fetch('https://onlineprintingz.in'+route,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{...await signedHeaders(secret,method,route,body),'Content-Type':'application/json'},...(method==='POST'?{body}:{})});
  if(!response.ok)throw Error(`Test connection returned HTTP ${response.status}. Check plugin 0.2.0, its enabled setting, and the matching secret; retry this same test.`);
  return response.json() as Promise<any>;
}
export function testView(r:any){return {id:r.id,status:r.status,title:r.data.title,remoteId:r.data.remoteId||null,stage:r.data.stage||'Not sent',checks:r.data.checks||[],error:r.data.error||'',updated:r.updated}}
async function fixture(id:string){if(!testId(id))throw Error('Choose a test reference');const r=await record(id);if(r.kind!=='Printing tests'||r.data.testMode!==true||r.data.payload?.sourceOrder!==id)throw Error('Not an isolated printing test');return r}
export async function createPrintingTest(owner:string) {
  if(!secrets().PRINTING_SECRET||secrets().PRINTING_SECRET.length<32)throw Error('Configure PRINTING_SECRET before running a test');
  const active=await db().prepare("SELECT * FROM records WHERE kind='Printing tests' AND json_extract(data,'$.active')=1 ORDER BY updated LIMIT 1").first<any>();
  if(active)return testView({...active,data:JSON.parse(active.data)});
  const id='osp-test-'+crypto.randomUUID(),files:any={},keys:any={};
  for(const kind of ['interior','cover'] as const){
    const pdf=testPDF(kind),key='printing-tests/'+id+'/'+kind+'.pdf';
    await secrets().BUCKET.put(key,pdf,{httpMetadata:{contentType:'application/pdf'}});
    keys[kind]=key;files[kind]={version:1,filename:'TEST-ONLY-'+kind+'.pdf',sha256:await digest(pdf)};
  }
  const config=printConfig({size:'A4',paper:'Cream uncoated',gsm:80,blackPages:42,colourPages:0,lamination:'Matte',unitWeightGrams:30,approved:true},42);
  const payload={schema:1,sourceOrder:id,testMode:true,mode:'hold',currency:'INR',delivery:{name:'TEST ONLY',address:'TEST ONLY - DO NOT SHIP',city:'Kolkata',state:'WB',pin:'700001',phone:'0000000000',country:'IN'},items:[{index:0,productId:12982,title:'TEST ONLY - OpenShelf automation sample - DO NOT PRINT',isbn:TEST_ISBN,trimSize:'8.5x11',copies:1,config,cost:printCost(config,1),files}]};
  await create(owner,'Printing tests','Prepared',{title:'TEST ONLY - Printing connection',testMode:true,payload,keys,active:true,checks:['Synthetic 42-page interior and test cover created','Placeholder ISBN '+TEST_ISBN+' (not allocated)','No payment, stock, royalty or customer order created']},id);
  return testView(await fixture(id));
}
export async function runPrintingTest(id:string,action:string,actor:string){
  let r=await fixture(id);
  if(action==='send'){
    if(!r.data.active)throw Error('This test is complete');
    const caps=await request('GET','/test-capabilities');
    if(caps.version!==1||caps.heldOnly!==true)throw Error('Install connector 0.2.0 before sending a test');
    const body=JSON.stringify(r.data.payload),hash=await digest(body),remote=await request('POST','/orders',body);
    if(!Number.isSafeInteger(remote.id)||remote.id<1||remote.sourceOrder!==id||remote.payloadHash!==hash||remote.testMode!==true)throw Error('Test receiver response mismatch');
    // Keep the original reference even if concurrent retries returned the same import.
    r=await fixture(id);
    if(r.data.remoteId&&r.data.remoteId!==remote.id)throw Error('Test import reference changed; review the receiver');
    await change(r,'Transferred',{...r.data,remoteId:remote.id,stage:'Awaiting approval',error:'',checks:[...r.data.checks,'WooCommerce #'+remote.id+' received the test on hold']});
  }else{
    if(!r.data.remoteId)throw Error('Send this test first');
    const remotePath='/test-orders/'+r.data.remoteId;
    if(action==='verify'){
      if(!r.data.active)throw Error('This test is complete');
      const duplicate=await request('POST','/orders',JSON.stringify(r.data.payload));
      if(duplicate.id!==r.data.remoteId||duplicate.sourceOrder!==id||duplicate.testMode!==true||duplicate.duplicate!==true||duplicate.payloadHash!==await digest(JSON.stringify(r.data.payload)))throw Error('Duplicate protection failed');
      const files=await request('POST',remotePath+'/check','{}');
      if(files.testMode!==true||files.sourceOrder!==id||files.files?.interior!==true||files.files?.cover!==true)throw Error('Private test PDF round-trip failed');
      await change(r,r.status,{...r.data,error:'',verified:true,checks:[...r.data.checks,'Replayed transfer returned the same WooCommerce order','Both private test PDFs fetched by WordPress with matching SHA-256 hashes']});
    }else if(action==='advance'){
      if(!r.data.active||!r.data.verified)throw Error('Verify files and duplicate protection first');
      const before=await request('GET','/orders/'+r.data.remoteId);
      if(before.sourceOrder!==id||before.testMode!==true||before.woocommerceStatus!=='on-hold')throw Error('Test order is not safely held');
      const next=printStages[printStages.indexOf(before.stage)+1];
      if(!next)throw Error('All simulated stages are complete');
      await request('POST',remotePath+'/stage',JSON.stringify({revision:before.revision,stage:next}));
      const after=await request('GET','/orders/'+r.data.remoteId);
      if(after.sourceOrder!==id||after.testMode!==true||after.stage!==next||after.woocommerceStatus!=='on-hold')throw Error('Test status synchronization failed');
      await change(r,'Simulating',{...r.data,error:'',stage:next,checks:[...r.data.checks,'Simulated '+next+' and synced back; WooCommerce stayed on hold']});
    }else if(action==='cancel'){
      const result=await request('POST',remotePath+'/cancel','{}');
      if(result.sourceOrder!==id||result.testMode!==true||result.woocommerceStatus!=='cancelled')throw Error('Test cleanup requires review');
      await change(r,'Complete',{...r.data,active:false,error:'',checks:[...r.data.checks,'Test WooCommerce order cancelled; no payment or courier booking performed']});
    }else throw Error('Unknown test action');
  }
  await audit(id,actor,'Printing test: '+action);
  return testView(await fixture(id));
}
export async function printingTests(){return (await db().prepare("SELECT * FROM records WHERE kind='Printing tests' ORDER BY updated DESC LIMIT 10").all<any>()).results.map((r:any)=>testView({...r,data:JSON.parse(r.data)}))}
export async function saveTestError(id:string,message:string){const r=await fixture(id);await change(r,r.status,{...r.data,error:message.slice(0,500),lastAttempt:now()})}
