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
// local signup/order flow. Returns true on success, otherwise a short reason the
// caller stores on the lead so staff can see why it did not reach the CRM.
export async function pushLeadToZoho(lead:any):Promise<true|string>{
  try{
    const e=env as any;
    if(!e.ZOHO_CLIENT_ID||!e.ZOHO_CLIENT_SECRET||!e.ZOHO_REFRESH_TOKEN)return 'Zoho is not configured';
    const token=await accessToken();
    if(!token)return 'Could not get a Zoho access token';
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
        Source_Page:lead.source||'free-publishing-landing',
        City:lead.city,
        State:lead.state,
        Country:lead.country,
        Zip_Code:lead.pin,
        Genre:lead.genre,
        Manuscript_Language:lead.language,
        Manuscript_Stage:lead.stage+(lead.completionTime?' ('+lead.completionTime+')':''),
        Access_Code:lead.code,
        Books_Planned:lead.booksPlanned,
        Author_Copies_Requested:lead.authorCopies,
        Extras_Requested:(lead.extrasWanted||[]).join(', ')+(lead.extrasOther?' — '+lead.extrasOther:''),
        How_Heard:lead.howHeard+(lead.howHeardOther?' — '+lead.howHeardOther:'')+(lead.handle?' ('+lead.handle+')':''),
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
    if(response.ok)return true;
    const detail=(await response.text().catch(()=>'')).replace(/\s+/g,' ').slice(0,200);
    return 'Zoho rejected the lead (HTTP '+response.status+')'+(detail?': '+detail:'');
  }catch(error:any){
    return 'Zoho request failed: '+String(error?.message||error).slice(0,120);
  }
}
