// Trial of every public/author form: submit realistic payloads through the real handlers
// on a scratch in-memory DB and report what is stored and which typed fields are dropped.
import ts from 'typescript';import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const database=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+f,'utf8'));
const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v)},async first(){return database.prepare(sql).get(...args)||null},async all(){return {results:database.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(database.prepare(sql).run(...args).changes)}}}});
globalThis.__env={DB:{prepare,async batch(s){database.exec('BEGIN');try{const r=[];for(const q of s)r.push(await q.run());database.exec('COMMIT');return r}catch(e){database.exec('ROLLBACK');throw e}}},FREE_PROGRAM_SLOTS:'100'};
let identity=null;globalThis.__getUser=async()=>identity;globalThis.__headers=async()=>new Headers();
const dir='.sites-runtime/form-trial';mkdirSync(dir,{recursive:true});
for(const [name,path] of Object.entries({server:'lib/server.ts','author-auth':'lib/author-auth.ts','book-content':'lib/book-content.ts','author-tools':'lib/author-tools.ts',providers:'lib/providers.ts',business:'lib/business.ts',zoho:'lib/zoho.ts',books:'app/api/books/route.ts',leads:'app/api/leads/route.ts',contact:'app/api/contact/route.ts',reviews:'app/api/reviews/route.ts',platform:'app/api/platform/route.ts',tools:'app/api/author-tools/route.ts'})){
  let s=readFileSync(path,'utf8').replace(/import \{books\} from '[^']+';/g,"const books=[{id:'salt-line',title:'Sample book',price:349}];").replace(/import \{env(,waitUntil)?\} from 'cloudflare:workers';/g,(m,w)=>'const env=globalThis.__env;'+(w?'const waitUntil=(p)=>p;':'')).replace(/import \{headers\} from 'next\/headers';/g,'const headers=globalThis.__headers;').replace(/import \{getChatGPTUser\} from '[^']+';/g,'const getChatGPTUser=globalThis.__getUser;').replace(/import \{getApplicationUser\} from '[^']+';/g,'const getApplicationUser=globalThis.__getUser;').replace(/from '(?:\.\.\/)*lib\/([a-z-]+)'/g,"from './$1.mjs'").replace(/from '\.\/([a-z-]+)'/g,"from './$1.mjs'");
  writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText)}
const m={};for(const n of ['server','books','leads','contact','reviews','platform','tools'])m[n]=await import('../'+dir+'/'+n+'.mjs');
const O='https://t.test';let ip=0;
const login=async(id,role='author')=>{identity={userId:id,email:id+'@example.test',displayName:id};await m.server.user();database.prepare('UPDATE members SET role=? WHERE id=?').run(role,id)};
const call=async(mod,path,body)=>{const r=await mod.POST(new Request(O+path,{method:'POST',headers:{origin:O,'content-type':'application/json','cf-connecting-ip':'9.9.9.'+(++ip)},body:JSON.stringify(body)}));let d={};try{d=await r.json()}catch{}return {status:r.status,d}};
const rows=[];const flat=o=>JSON.stringify(o);
function report(form,endpoint,sent,res,id){
  const rec=id?database.prepare('SELECT * FROM records WHERE id=?').get(id):null;
  const data=rec?JSON.parse(rec.data):{};
  const dropped=Object.keys(sent).filter(k=>!(k in data)&&!['action','id','version','data','stage','consent','website','items','requestKey'].includes(k)&&sent[k]!==''&&sent[k]!==undefined);
  rows.push({form,endpoint,http:res.status,stored:!!rec,kind:rec?.kind,status:rec?.status,dropped,error:res.status>=400?res.d.error:''});
}
// 1 Free publishing drive
const lead={name:'Asha Rao',phone:'9876543210',email:'asha@example.com',country:'India',state:'WB',city:'Kolkata',pin:'700001',howHeard:'Instagram',handle:'@asha',genre:'Fiction',language:'English',stage:'Draft ready',completionTime:'1 month',booksPlanned:'1',authorCopies:10,extrasWanted:['Cover design'],extrasOther:'x',note:'hello',consent:true};
let r=await call(m.leads,'/api/leads',lead);const lid=database.prepare("SELECT id FROM records WHERE kind='Leads'").get()?.id;report('100 Free Posts application','/api/leads',lead,r,lid);
// 2 Contact
const c={name:'Ravi',email:'ravi@example.com',phone:'9000000000',subject:'Quote',message:'Need 200 copies printed please'};
r=await call(m.contact,'/api/contact',c);report('Contact page','/api/contact',c,r,r.d.id);
// 3 Start a book + journey + submit
await login('author1');
const start={title:'My Book',contactName:'Asha Rao',contactEmail:'asha@example.com',phone:'9876543210',genre:'Fiction',language:'English',source:'write'};
r=await call(m.books,'/api/books',{action:'start-book',data:start});const bid=r.d.id;report('Start a book','/api/books start-book',start,r,bid);
if(bid){
 const stages={info:{title:'My Book',subtitle:'Sub',contactName:'Asha',language:'English',genre:'Fiction'},specs:{trimSize:'6x9',interiorColor:'Black & white',paperType:'Cream',lamination:'Matte',binding:'Paperback',pageCount:120},distribution:{distributionPlan:'Website bookstore',formats:['Paperback'],distributionNotes:'n',retailPrice:299},metadata:{blurb:'A blurb',authorBio:'Bio',keywords:'a,b',retailPrice:299,fulfillmentType:'Print-on-demand',initialStock:0}};
 for(const [stage,v] of Object.entries(stages)){const ver=database.prepare('SELECT version FROM records WHERE id=?').get(bid).version;r=await call(m.books,'/api/books',{action:'save-stage',id:bid,version:ver,stage,data:v});report('Book journey: '+stage,'/api/books save-stage',v,r,bid)}
 const ver=database.prepare('SELECT version FROM records WHERE id=?').get(bid).version;
 r=await call(m.books,'/api/books',{action:'submit-book',id:bid,version:ver,rightsConfirmed:true,reviewConfirmed:true});report('Submit book for review','/api/books submit-book',{},r,bid);
 rows[rows.length-1].note='status after: '+database.prepare('SELECT status FROM records WHERE id=?').get(bid).status;
}
// 4 Platform generic create forms (author-side)
const mk=async(label,kind,data)=>{r=await call(m.platform,'/api/platform',{action:'create',kind,data});report(label,'/api/platform create '+kind,data,r,r.d.id)};
await mk('Submit manuscript (Submissions)','Submissions',{title:'MS',genre:'Fiction',wordCount:50000,synopsis:'syn',name:'Asha',contactEmail:'a@example.com',phone:'9876543210'});
await mk('Order checkout (Orders)','Orders',{title:'Sample book × 1',items:[{id:'salt-line',qty:1}],requestKey:'k1',subtotal:349,shipping:50,total:399,name:'Asha',contactEmail:'a@example.com',phone:'9876543210',address:'1 Road',city:'Kolkata',state:'WB',pin:'700001'});
await mk('Service request (Services)','Services',{title:'Cover',description:'d',serviceType:'Editing',priority:'High'});
await mk('Support ticket (Support)','Support',{title:'Help',description:'d',priority:'High'});
await mk('Campaign (Campaigns)','Campaigns',{title:'Launch',campaignType:'Social',startDate:'2026-12-01',endDate:'2026-12-10',budget:5000,description:'d'});
// 5 Review
const cat=await m.server.create('staff','Catalogue','Published',{title:'Cat book',author:'A',pricePaise:34900,stock:5});
r=await call(m.reviews,'/api/reviews',{action:'submit',bookId:cat,rating:5,text:'Loved this book a lot'});const rv=database.prepare("SELECT id FROM records WHERE kind='Reviews'").get();report('Book review','/api/reviews',{rating:5,text:'x'},r,rv?.id);
// 6 Comment on a record
const sup=rows.find(x=>x.form.startsWith('Support'));
console.log(JSON.stringify(rows,null,1));
