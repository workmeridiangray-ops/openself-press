import {env} from 'cloudflare:workers';

// Refresh-token OAuth flow against Zoho's India data center (accounts.zoho.in / zohoapis.in).
// Credentials are Cloudflare Worker secrets — never hardcoded, never logged.
async function accessToken(){
  const e=env as any;
  if(!e.ZOHO_CLIENT_ID||!e.ZOHO_CLIENT_SECRET||!e.ZOHO_REFRESH_TOKEN)return null;
  const body=new URLSearchParams({
    grant_type:'refresh_token',
    client_id:e.ZOHO_CLIENT_ID,
    client_secret:e.ZOHO_CLIENT_SECRET,
    refresh_token:e.ZOHO_REFRESH_TOKEN,
  });
  const response=await fetch('https://accounts.zoho.in/oauth/v2/token',{method:'POST',body,signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const result:any=await response.json();
  return result.access_token||null;
}

// Fire-and-forget style: callers should never let a Zoho failure block the
// local signup/order flow. Returns true/false so the caller can log it.
export async function pushLeadToZoho(lead:any):Promise<boolean>{
  try{
    const token=await accessToken();
    if(!token)return false;
    const description=[
      'Free publishing program application (MP100).',
      'Access code: '+lead.code,
      'Location: '+[lead.city,lead.state,lead.country,lead.pin].filter(Boolean).join(', '),
      'Found us via: '+lead.howHeard+(lead.howHeardOther?' — '+lead.howHeardOther:'')+(lead.handle?' ('+lead.handle+')':''),
      'Genre: '+lead.genre,
      'Language: '+lead.language,
      'Manuscript stage: '+lead.stage+(lead.completionTime?' — expected completion '+lead.completionTime:''),
      'Books planned: '+lead.booksPlanned,
      'Author copies requested: '+lead.authorCopies,
      'Extras requested: '+((lead.extrasWanted||[]).join(', ')||'None')+(lead.extrasOther?' — '+lead.extrasOther:''),
      lead.note?'Note from applicant: '+lead.note:''
    ].filter(Boolean).join('\n');
    const payload={
      data:[{
        Last_Name:lead.name,
        Company:lead.name+' (self-published author)',
        Email:lead.email,
        Phone:lead.phone,
        Lead_Source:'Website',
        Description:description,
      }],
      trigger:[]
    };
    const response=await fetch('https://www.zohoapis.in/crm/v2/Leads',{
      method:'POST',
      headers:{'Authorization':'Zoho-oauthtoken '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(10000),
    });
    return response.ok;
  }catch{
    return false;
  }
}
