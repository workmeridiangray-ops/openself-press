import {env} from 'cloudflare:workers';
import {randomToken} from '../../../../lib/author-auth';
export const dynamic='force-dynamic';

const b64url=(buf:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const isDev=(url:URL)=>['localhost','127.0.0.1'].includes(url.hostname);

// Step 1 of staff sign-in: send the browser to Google. A random state and a PKCE
// verifier are kept in a short-lived HttpOnly cookie and checked on the way back.
export async function GET(req:Request){
  const url=new URL(req.url);
  const e=env as any;
  const back=(message:string)=>new Response(null,{status:302,headers:{Location:url.origin+'/admin/login?error='+encodeURIComponent(message),'Cache-Control':'no-store'}});
  if(!e.GOOGLE_CLIENT_ID||!e.GOOGLE_CLIENT_SECRET)return back('Google sign-in is not set up yet. Ask the site owner to add the Google client ID and secret.');
  const state=randomToken(),verifier=randomToken();
  const challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  const dev=isDev(url);
  const cookie=(dev?'mp_oauth_dev':'__Host-mp_oauth')+'='+state+'.'+verifier+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=600'+(dev?'':'; Secure');
  const params=new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,redirect_uri:url.origin+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'});
  return new Response(null,{status:302,headers:{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+params.toString(),'Set-Cookie':cookie,'Cache-Control':'no-store'}});
}
