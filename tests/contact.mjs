import ts from 'typescript';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';

const db=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
const statement=(sql,args=[])=>({bind(...a){return statement(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}});
globalThis.__env={DB:{prepare:statement}};

const source=readFileSync('app/api/contact/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/,'const env=globalThis.__env;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const origin='https://example.test';
const send=(body,{ip='1.1.1.1',from=origin}={})=>POST(new Request(origin+'/api/contact',{method:'POST',headers:{'content-type':'application/json','origin':from,'cf-connecting-ip':ip},body:JSON.stringify(body)}));
const good={name:'Asha Rao',email:'Asha@Example.com',subject:'Print quote',message:'Can you quote 200 paperbacks of a 6x9 book?'};
const count=()=>db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Enquiries'").get().n;

// A signed-out visitor's message is stored for staff.
let r=await send(good,{ip:'2.2.2.2'});
assert.equal(r.status,200);
assert.equal(count(),1);
const row=db.prepare("SELECT * FROM records WHERE kind='Enquiries'").get();
assert.equal(row.status,'New');
assert.equal(JSON.parse(row.data).email,'asha@example.com');
assert.equal(JSON.parse(row.data).title,'Print quote');

// Validation and origin checks.
assert.equal((await send({...good,email:'nope'},{ip:'3.3.3.3'})).status,400);
assert.equal((await send({...good,message:'short'},{ip:'3.3.3.4'})).status,400);
assert.equal((await send(good,{ip:'3.3.3.5',from:'https://evil.test'})).status,403);
assert.equal(count(),1);

// Bots filling the hidden field are accepted silently but nothing is stored.
r=await send({...good,website:'http://spam.test'},{ip:'4.4.4.4'});
assert.equal(r.status,200);
assert.equal(count(),1);

// Per-IP limit: 5 per hour, then 429.
for(let i=0;i<5;i++)assert.equal((await send(good,{ip:'5.5.5.5'})).status,200);
assert.equal((await send(good,{ip:'5.5.5.5'})).status,429);

console.log('contact: ok');
