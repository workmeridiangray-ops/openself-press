import {env} from 'cloudflare:workers';
import {digest,GOOGLE_SSO,googleRole,issueSession,rateLimit,saveSignup,sendMail,loginNotice,staffEmail,sessionCookie,signupPhone} from '../../../../../lib/author-auth';
export const dynamic='force-dynamic';

const isDev=(url:URL)=>['localhost','127.0.0.1'].includes(url.hostname);
const cookieName=(url:URL)=>isDev(url)?'mp_oauth_dev':'__Host-mp_oauth';
const clearCookie=(url:URL)=>cookieName(url)+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(isDev(url)?'':'; Secure');

// Step 2: Google sends the browser back here with a one-time code. We exchange it
// server-side, check the Google account is on the allowlist, then start a session.
export async function GET(req:Request){
  const url=new URL(req.url);
  const e=env as any;
  const db=env.DB!;
  const fail=(message:string)=>new Response(null,{status:302,headers:{Location:url.origin+'/login?error='+encodeURIComponent(message),'Set-Cookie':clearCookie(url),'Cache-Control':'no-store'}});
  try{
    if(url.searchParams.get('error'))return fail('Google sign-in was cancelled.');
    const code=url.searchParams.get('code')||'',state=url.searchParams.get('state')||'';
    const name=cookieName(url);
    const stored=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
    const [savedState,verifier]=stored.split('.');
    if(!code||!state||!savedState||!verifier||state!==savedState)return fail('Your sign-in session expired. Please try again.');
    if(!e.GOOGLE_CLIENT_ID||!e.GOOGLE_CLIENT_SECRET)return fail('Google sign-in is not set up yet.');
    try{await rateLimit(req,'google')}catch{return fail('Too many sign-in attempts. Please wait and try again.')}

    const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,redirect_uri:url.origin+'/api/auth/google/callback',grant_type:'authorization_code',code_verifier:verifier})});
    if(!tokenResponse.ok)return fail('Google could not confirm your sign-in. Please try again.');
    const tokens:any=await tokenResponse.json();
    // The ID token came straight from Google over TLS in exchange for our one-time code,
    // so its contents are trusted; we still check who it is for and that it is fresh.
    const payload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(tokens.id_token||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
    const issuerOk=['https://accounts.google.com','accounts.google.com'].includes(payload.iss);
    if(!issuerOk||payload.aud!==e.GOOGLE_CLIENT_ID||Number(payload.exp)*1000<Date.now()||payload.email_verified!==true||!payload.email)return fail('Google could not verify this account.');

    const email=String(payload.email).toLowerCase();
    const staffRole=googleRole(email);

    const displayName=String(payload.name||email).slice(0,120);
    const now=new Date().toISOString();
    let account=await db.prepare('SELECT * FROM author_accounts WHERE email=?').bind(email).first<any>();
    let created=false;
    if(!account){
      created=true;
      const memberId='google-'+digest(email).slice(0,32);
      await db.batch([
        db.prepare('INSERT INTO author_accounts VALUES(?,?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),memberId,email,displayName,GOOGLE_SSO,now,now,now),
        db.prepare('INSERT OR IGNORE INTO members VALUES(?,?,?)').bind(memberId,email,'author'),
      ]);
    }else if(account.password_hash!==GOOGLE_SSO&&(staffRole||!account.verified_at)){
      // Admin/staff emails, and accounts whose email was never verified, are taken over: Google has proved
      // who owns the email, so any password set on it before is removed. Verified author accounts are simply linked.
      await db.batch([
        db.prepare('UPDATE author_accounts SET password_hash=?,verified_at=?,auth_version=auth_version+1,updated=? WHERE id=?').bind(GOOGLE_SSO,now,now,account.id),
        db.prepare('DELETE FROM author_sessions WHERE account_id=?').bind(account.id),
      ]);
    }
    account=await db.prepare('SELECT * FROM author_accounts WHERE email=?').bind(email).first<any>();

    const days=staffRole?1:7;
    if(created){await sendMail(email,'Welcome to Open Shelf Press','Hi '+displayName+',\n\nYour account is ready. You can start a book, submit a manuscript or apply for the free publishing programme any time.\n\nOpen your studio: '+url.origin+'/workspace/books');if(!staffRole)await sendMail(staffEmail(),'New sign-up: '+displayName,displayName+' ('+email+') signed up with Google.')}else await loginNotice(account,'Google');
    await saveSignup(account.member_id,{name:account.display_name,email,method:'google'});
    const hasPhone=!!(await signupPhone(account.member_id));
    const token=await issueSession(account,days);
    await db.prepare('INSERT INTO activity VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'account-'+account.member_id,email,staffRole?'Staff signed in with Google':'Signed in with Google',now).run();
    const headers=new Headers({Location:url.origin+(staffRole?'/admin/overview':hasPhone?'/workspace/books':'/account?phone=1'),'Cache-Control':'no-store'});
    headers.append('Set-Cookie',sessionCookie(req,token,days));
    headers.append('Set-Cookie',clearCookie(url));
    return new Response(null,{status:302,headers});
  }catch{
    return fail('Sign-in failed. Please try again.');
  }
}
