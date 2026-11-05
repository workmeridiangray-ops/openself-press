import ts from 'typescript';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';

const database=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+f,'utf8'));
const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v)},async first(){return database.prepare(sql).get(...args)||null},async all(){return {results:database.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(database.prepare(sql).run(...args).changes)}}}});
globalThis.__env={
  DB:{prepare,async batch(statements){database.exec('BEGIN');try{const r=[];for(const q of statements)r.push(await q.run());database.exec('COMMIT');return r}catch(e){database.exec('ROLLBACK');throw e}}},
  GOOGLE_CLIENT_ID:'client-123',GOOGLE_CLIENT_SECRET:'secret-456',
  ADMIN_EMAILS:'Owner@Example.test',STAFF_EMAILS:'desk@example.test, other@example.test',
};
let requestHeaders=new Headers();
globalThis.__getPlatformUser=async()=>null;
globalThis.__headers=async()=>requestHeaders;

const dir='.sites-runtime/google-login-tests';
mkdirSync(dir,{recursive:true});
for(const [name,path] of Object.entries({'author-auth':'lib/author-auth.ts',server:'lib/server.ts',start:'app/api/auth/google/route.ts',callback:'app/api/auth/google/callback/route.ts',auth:'app/api/auth/route.ts',platform:'app/api/platform/route.ts'})){
  const source=readFileSync(path,'utf8')
    .replace(/import \{env\} from 'cloudflare:workers';/g,'const env=globalThis.__env;')
    .replace(/import \{headers\} from 'next\/headers';/g,'const headers=globalThis.__headers;')
    .replace(/import \{getChatGPTUser\} from '[^']+';/g,'const getChatGPTUser=globalThis.__getPlatformUser;')
    .replace(/from '(?:\.\.\/)*lib\/(author-auth|server)'/g,"from './$1.mjs'")
    .replace(/from '\.\/author-auth'/g,"from './author-auth.mjs'")
    .replace(/import \{books\} from '[^']+';/g,"const books=[{id:'salt-line',title:'Sample',price:349}];");
  writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const start=await import('../'+dir+'/start.mjs');
const callback=await import('../'+dir+'/callback.mjs');
const auth=await import('../'+dir+'/auth.mjs');
const platform=await import('../'+dir+'/platform.mjs');

const origin='https://auth.test';
let ip=0;
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken=(over={})=>'h.'+b64({iss:'https://accounts.google.com',aud:'client-123',exp:Math.floor(Date.now()/1000)+3600,email_verified:true,email:'owner@example.test',name:'Site Owner',...over})+'.s';
let tokenReply=()=>({ok:true,json:async()=>({id_token:idToken()})});
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://oauth2.googleapis.com/token'))return tokenReply(init);return realFetch(url,init)};

// Run the start step and return the state Google would send back.
async function begin(){
  const res=await start.GET(new Request(origin+'/api/auth/google'));
  assert.equal(res.status,302);
  const loc=new URL(res.headers.get('location'));
  assert.equal(loc.origin+loc.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(loc.searchParams.get('client_id'),'client-123');
  assert.equal(loc.searchParams.get('redirect_uri'),origin+'/api/auth/google/callback');
  assert.equal(loc.searchParams.get('code_challenge_method'),'S256');
  const cookie=res.headers.get('set-cookie');
  assert.match(cookie,/^__Host-mp_oauth=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
  return {state:loc.searchParams.get('state'),cookie:cookie.split(';')[0]};
}
async function finish({state,cookie},{code='abc',stateParam=state}={}){
  return callback.GET(new Request(origin+'/api/auth/google/callback?code='+code+'&state='+stateParam,{headers:{cookie,'cf-connecting-ip':'198.51.100.'+(++ip)}}));
}
const errorOf=(res)=>decodeURIComponent(new URL(res.headers.get('location')).searchParams.get('error')||'');
const sessionFrom=(res)=>(res.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).find(c=>c.startsWith('__Host-mp_author='))||'';
async function me(cookie){
  requestHeaders=new Headers({host:'auth.test',cookie});
  const res=await platform.GET(new Request(origin+'/api/platform',{headers:{cookie}}));
  return {status:res.status,body:await res.json()};
}
const accounts=()=>database.prepare('SELECT COUNT(*) AS n FROM author_accounts').get().n;

// Not configured -> friendly error, no redirect to Google.
const saved=globalThis.__env.GOOGLE_CLIENT_ID;globalThis.__env.GOOGLE_CLIENT_ID='';
let res=await start.GET(new Request(origin+'/api/auth/google'));
assert.match(new URL(res.headers.get('location')).pathname,/admin\/login/);
globalThis.__env.GOOGLE_CLIENT_ID=saved;

// Listed admin: signed in, lands on the admin area, has the admin role.
let flow=await begin();
res=await finish(flow);
assert.equal(res.status,302);
assert.equal(new URL(res.headers.get('location')).pathname,'/admin/overview');
const adminCookie=sessionFrom(res);
assert.ok(adminCookie,'session cookie issued');
let who=await me(adminCookie);
assert.equal(who.status,200);
assert.equal(who.body.user.role,'admin');
assert.equal(who.body.user.email,'owner@example.test');

// Staff list gives staff, not admin.
tokenReply=()=>({ok:true,json:async()=>({id_token:idToken({email:'desk@example.test',name:'Desk'})})});
flow=await begin();res=await finish(flow);
who=await me(sessionFrom(res));
assert.equal(who.body.user.role,'staff');

// Anyone with a verified Google account can sign in: an ordinary author, never staff or admin.
tokenReply=()=>({ok:true,json:async()=>({id_token:idToken({email:'reader@example.test',name:'Reader One'})})});
flow=await begin();res=await finish(flow);
assert.equal(new URL(res.headers.get('location')).pathname+new URL(res.headers.get('location')).search,'/account?phone=1');
const readerCookie=sessionFrom(res);assert.ok(readerCookie);
who=await me(readerCookie);assert.equal(who.body.user.role,'author');
// Phone is collected after the first Google login and stored for staff.
const savePhone=(cookie,phone)=>auth.POST(new Request(origin+'/api/auth',{method:'POST',headers:{origin,cookie,'Content-Type':'application/json','cf-connecting-ip':'203.0.113.50'},body:JSON.stringify({action:'save-phone',phone})}));
assert.equal((await savePhone(readerCookie,'abc')).status,400);
assert.equal((await savePhone(readerCookie,'+91 98765 43210')).status,200);
const signup=JSON.parse(database.prepare("SELECT data FROM records WHERE kind='Signups' AND json_extract(data,'$.email')='reader@example.test'").get().data);
assert.equal(signup.name,'Reader One');assert.equal(signup.phone,'+91 98765 43210');assert.equal(signup.method,'google');
// Second login goes straight to the workspace.
flow=await begin();res=await finish(flow);
assert.equal(new URL(res.headers.get('location')).pathname,'/workspace/books');

// A verified password account is linked (password kept); an unverified one is taken over.
database.prepare("INSERT INTO author_accounts VALUES('acc-v','author-v','verified@example.test','Verified','scrypt$16384$8$5$00$00','t',1,'t','t')").run();
tokenReply=()=>({ok:true,json:async()=>({id_token:idToken({email:'verified@example.test',name:'Verified'})})});
flow=await begin();res=await finish(flow);assert.ok(sessionFrom(res));
assert.equal(database.prepare("SELECT password_hash FROM author_accounts WHERE id='acc-v'").get().password_hash,'scrypt$16384$8$5$00$00');

// Wrong state, wrong audience, unverified email and expired tokens are refused.
tokenReply=()=>({ok:true,json:async()=>({id_token:idToken()})});
flow=await begin();res=await finish(flow,{stateParam:'tampered'});
assert.match(errorOf(res),/expired/);
for(const bad of [{aud:'someone-else'},{email_verified:false},{exp:Math.floor(Date.now()/1000)-10},{iss:'https://evil.test'}]){
  tokenReply=()=>({ok:true,json:async()=>({id_token:idToken(bad)})});
  flow=await begin();res=await finish(flow);
  assert.equal(sessionFrom(res),'',JSON.stringify(bad));
  assert.ok(errorOf(res),JSON.stringify(bad));
}
tokenReply=()=>({ok:false,json:async()=>({})});
flow=await begin();res=await finish(flow);
assert.equal(sessionFrom(res),'');

// Password sign-in can never match a Google account.
res=await auth.POST(new Request(origin+'/api/auth',{method:'POST',headers:{origin,'Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify({action:'login',email:'owner@example.test',password:'Any password at all 123'})}));
assert.equal(res.status,401);

// Removing an email from the allowlist revokes access on the very next request.
globalThis.__env.ADMIN_EMAILS='';
who=await me(adminCookie);
assert.equal(who.body.user.role,'author');
globalThis.__env.ADMIN_EMAILS='Owner@Example.test';

// A password account someone registered earlier on an admin's email is taken over, not trusted.
database.prepare("INSERT INTO author_accounts VALUES('acc-x','author-x','other@example.test','Squatter','scrypt$16384$8$5$00$00',NULL,1,'t','t')").run();
database.prepare("INSERT INTO author_sessions VALUES(?,?,?,?,?)").run('old-session','acc-x',1,Date.now()+86400000,'t');
tokenReply=()=>({ok:true,json:async()=>({id_token:idToken({email:'other@example.test',name:'Real Staff'})})});
flow=await begin();res=await finish(flow);
const row=database.prepare("SELECT * FROM author_accounts WHERE id='acc-x'").get();
assert.equal(row.password_hash,'google-sso');
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM author_sessions WHERE id='old-session'").get().n,0);
assert.equal((await me(sessionFrom(res))).body.user.role,'staff');

console.log('google-login: ok');
