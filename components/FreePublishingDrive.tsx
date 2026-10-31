'use client';
import React,{useState} from 'react';
import {ArrowRight} from 'lucide-react';

const HOW_HEARD=['Instagram','Threads','Quora','Facebook','WhatsApp','A friend / word of mouth','Other'];
const EXTRAS=['Postcards','Visiting cards','Bookmarks','Stickers','Other','None of these'];
const GENRES=['Fiction — general','Fiction — romance','Fiction — fantasy / sci-fi','Fiction — thriller / mystery','Non-fiction','Self-help / motivational','Poetry',"Children's book",'Academic / textbook','Biography / memoir','Other'];
const LANGUAGES=['English','Hindi','Marathi','Gujarati','Bengali','Tamil','Telugu','Kannada','Other'];
const STAGES=[['Not started','Not started — idea stage'],['Outlining','Outlining / planning'],['In progress','In progress — partially written'],['Complete','Complete — ready to publish']];
const COMPLETION_TIMES=['Within 1 month','1–3 months','3–6 months','6–12 months','Not sure yet'];
const BOOKS_PLANNED=['Just this 1 book','2–3 books','4–5 books','6 or more'];

const STEP_LABELS=['About you','Your location','How you found us','Your manuscript','Copies & extras','Review'];

type FormState={
  name:string;phone:string;email:string;country:string;state:string;city:string;pin:string;
  howHeard:string;howHeardOther:string;handle:string;genre:string;language:string;stage:string;
  completionTime:string;booksPlanned:string;authorCopies:string;extrasWanted:string[];extrasOther:string;note:string;
};
const empty:FormState={name:'',phone:'',email:'',country:'India',state:'',city:'',pin:'',howHeard:'',howHeardOther:'',handle:'',genre:'',language:'',stage:'',completionTime:'',booksPlanned:'',authorCopies:'',extrasWanted:[],extrasOther:'',note:''};

export default function FreePublishingDrive(){
  const [step,setStep]=useState(0);
  const [f,setF]=useState<FormState>(empty);
  const [errors,setErrors]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false);
  const [serverError,setServerError]=useState('');
  const [code,setCode]=useState('');
  const [saved,setSaved]=useState(false);
  const [copied,setCopied]=useState(false);

  function set<K extends keyof FormState>(key:K,value:FormState[K]){setF(prev=>({...prev,[key]:value}))}
  function toggleExtra(v:string){
    setF(prev=>{
      let next=prev.extrasWanted.includes(v)?prev.extrasWanted.filter(x=>x!==v):[...prev.extrasWanted,v];
      if(v==='None of these'&&!prev.extrasWanted.includes(v))next=['None of these'];
      else next=next.filter(x=>x!=='None of these'||v==='None of these');
      return {...prev,extrasWanted:next}
    })
  }

  function validate(i:number){
    const e:Record<string,boolean>={};
    if(i===0){
      if(!f.name.trim())e.name=true;
      if(!/^[0-9+()\- ]{7,20}$/.test(f.phone))e.phone=true;
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))e.email=true;
    }
    if(i===1){
      if(!f.country.trim())e.country=true;
      if(!f.state.trim())e.state=true;
      if(!f.city.trim())e.city=true;
      if(!f.pin.trim())e.pin=true;
    }
    if(i===2){ if(!f.howHeard)e.howHeard=true }
    if(i===3){
      if(!f.genre)e.genre=true;
      if(!f.language)e.language=true;
      if(!f.stage)e.stage=true;
      if(!f.booksPlanned)e.booksPlanned=true;
    }
    if(i===4){
      const n=Number(f.authorCopies);
      if(f.authorCopies===''||isNaN(n)||n<0)e.authorCopies=true;
    }
    setErrors(e);
    return Object.keys(e).length===0;
  }

  async function next(){
    if(step<STEP_LABELS.length-1){
      if(!validate(step))return;
      setStep(step+1);
      return;
    }
    setBusy(true);setServerError('');
    try{
      const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f,authorCopies:Number(f.authorCopies)})});
      const d:any=await r.json();
      if(!r.ok)throw Error(d.error||'Could not submit your application');
      setCode(d.code);setSaved(true);
    }catch(e:any){setServerError(e.message)}
    finally{setBusy(false)}
  }
  function back(){ if(step>0)setStep(step-1) }
  function copyCode(){
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(code).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500)}).catch(()=>{})}
  }

  if(saved){
    return <div className="fpd-wrap">
      <style dangerouslySetInnerHTML={{__html:FPD_CSS}}/>
      <div className="fpd-confirm">
        <h2>You're in. Welcome.</h2>
        <p>Save this access code — you'll use it later to activate your free publishing slot when it's your turn.</p>
        <div className="fpd-code">{code}</div>
        <button className="fpd-ghost" onClick={copyCode}>{copied?'Copied!':'Copy code'}</button>
        <p className="fpd-small">Your application has been recorded.</p>
        <div style={{marginTop:22}}>
          <a className="fpd-primary" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}} href={'/login?next='+encodeURIComponent('/submit?code='+code)} target="_top">Continue to submit your manuscript<ArrowRight size={16}/></a>
        </div>
        <p className="fpd-small" style={{marginTop:12}}>Ready now? Log in or create your author account with the same email, and your code carries through automatically.</p>
      </div>
    </div>
  }

  return <div className="fpd-wrap">
    <style dangerouslySetInnerHTML={{__html:FPD_CSS}}/>
    <div className="fpd-hero">
      <div className="fpd-eyebrow">A Free Publishing Initiative</div>
      <h1>We're opening 100 free self-publishing slots.</h1>
      <p className="fpd-lead">Publishing shouldn't cost a writer their savings. We're starting with 100 authors — no publishing fee, no catch — because we believe the next great book shouldn't stay unwritten over money.</p>
      <div className="fpd-badges">
        <span>100 slots, free of cost</span>
        <span>Priority by application order</span>
        <span>Takes about 3 minutes</span>
      </div>
    </div>

    <div className="fpd-why">
      <h2>Why we're doing this</h2>
      <p className="fpd-why-sub">Too many good manuscripts never become books — priced out, stuck in submission queues, or simply unsure where to start. This is our way of changing that for 100 writers, starting now.</p>
      <div className="fpd-why-grid">
        <div><h3>No publishing fee</h3><p>Your manuscript becomes a real, purchasable book — on us.</p></div>
        <div><h3>You keep your rights</h3><p>It's your book, your name, your royalties.</p></div>
        <div><h3>A real production team</h3><p>Editing guidance, cover design and a proper print/ebook release.</p></div>
      </div>
    </div>

    <div className="fpd-card">
      <div className="fpd-progress">{STEP_LABELS.map((_,i)=><span key={i} className={i<step?'done':i===step?'now':''}/>)}</div>
      {serverError&&<div className="fpd-servererr" role="alert">{serverError}</div>}

      {step===0&&<section>
        <div className="fpd-steplabel">Step 1 of 6</div>
        <h2>About you</h2>
        <p className="fpd-hint">So we know who's applying.</p>
        <label>Full name</label>
        <input value={f.name} maxLength={120} onChange={e=>set('name',e.target.value)} autoComplete="name"/>
        {errors.name&&<div className="fpd-err">Please enter your full name.</div>}
        <div className="fpd-row2">
          <div><label>Phone number</label><input value={f.phone} maxLength={20} onChange={e=>set('phone',e.target.value)} autoComplete="tel"/>{errors.phone&&<div className="fpd-err">Please enter a valid phone number.</div>}</div>
          <div><label>Email address</label><input value={f.email} maxLength={200} onChange={e=>set('email',e.target.value)} autoComplete="email"/>{errors.email&&<div className="fpd-err">Please enter a valid email.</div>}</div>
        </div>
      </section>}

      {step===1&&<section>
        <div className="fpd-steplabel">Step 2 of 6</div>
        <h2>Where are you writing from?</h2>
        <div className="fpd-row2">
          <div><label>Country</label><input value={f.country} maxLength={80} onChange={e=>set('country',e.target.value)} autoComplete="country-name"/>{errors.country&&<div className="fpd-err">Please enter your country.</div>}</div>
          <div><label>State</label><input value={f.state} maxLength={80} onChange={e=>set('state',e.target.value)} autoComplete="address-level1"/>{errors.state&&<div className="fpd-err">Please enter your state.</div>}</div>
        </div>
        <div className="fpd-row2">
          <div><label>City</label><input value={f.city} maxLength={80} onChange={e=>set('city',e.target.value)} autoComplete="address-level2"/>{errors.city&&<div className="fpd-err">Please enter your city.</div>}</div>
          <div><label>PIN / ZIP code</label><input value={f.pin} maxLength={12} onChange={e=>set('pin',e.target.value)} autoComplete="postal-code"/>{errors.pin&&<div className="fpd-err">Please enter your PIN/ZIP code.</div>}</div>
        </div>
      </section>}

      {step===2&&<section>
        <div className="fpd-steplabel">Step 3 of 6</div>
        <h2>How did you hear about us?</h2>
        <div className="fpd-choices">{HOW_HEARD.map(v=><span key={v} className={'fpd-chip'+(f.howHeard===v?' sel':'')} onClick={()=>set('howHeard',v)}>{v}</span>)}</div>
        {errors.howHeard&&<div className="fpd-err">Please select one.</div>}
        {f.howHeard==='Other'&&<><label>Tell us where <span className="fpd-opt">(optional)</span></label><input value={f.howHeardOther} maxLength={120} onChange={e=>set('howHeardOther',e.target.value)}/></>}
        <label>Your handle on that platform <span className="fpd-opt">(optional)</span></label>
        <input value={f.handle} maxLength={100} placeholder="@yourname" onChange={e=>set('handle',e.target.value)}/>
      </section>}

      {step===3&&<section>
        <div className="fpd-steplabel">Step 4 of 6</div>
        <h2>Your manuscript</h2>
        <label>Genre / category</label>
        <select value={f.genre} onChange={e=>set('genre',e.target.value)}><option value="">Select one</option>{GENRES.map(g=><option key={g}>{g}</option>)}</select>
        {errors.genre&&<div className="fpd-err">Please choose a genre.</div>}
        <label>Manuscript language</label>
        <select value={f.language} onChange={e=>set('language',e.target.value)}><option value="">Select one</option>{LANGUAGES.map(l=><option key={l}>{l}</option>)}</select>
        {errors.language&&<div className="fpd-err">Please choose a language.</div>}
        <label>What stage is your manuscript at?</label>
        <select value={f.stage} onChange={e=>set('stage',e.target.value)}><option value="">Select one</option>{STAGES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        {errors.stage&&<div className="fpd-err">Please select your manuscript's stage.</div>}
        {f.stage&&f.stage!=='Complete'&&<><label>If it's not finished yet, when do you expect to complete it?</label>
          <select value={f.completionTime} onChange={e=>set('completionTime',e.target.value)}><option value="">Select one</option>{COMPLETION_TIMES.map(c=><option key={c}>{c}</option>)}</select></>}
        <label>How many books are you planning to publish with us?</label>
        <select value={f.booksPlanned} onChange={e=>set('booksPlanned',e.target.value)}><option value="">Select one</option>{BOOKS_PLANNED.map(b=><option key={b}>{b}</option>)}</select>
        {errors.booksPlanned&&<div className="fpd-err">Please make a selection.</div>}
      </section>}

      {step===4&&<section>
        <div className="fpd-steplabel">Step 5 of 6</div>
        <h2>Copies & extras</h2>
        <label>How many author copies are you planning to order for yourself?</label>
        <input type="number" min={0} max={500} placeholder="e.g. 10" value={f.authorCopies} onChange={e=>set('authorCopies',e.target.value)}/>
        {errors.authorCopies&&<div className="fpd-err">Please enter a number (0 or more).</div>}
        <label>Want anything shipped along with your books? <span className="fpd-opt">(select all that apply)</span></label>
        <div className="fpd-choices">{EXTRAS.map(v=><span key={v} className={'fpd-chip'+(f.extrasWanted.includes(v)?' sel':'')} onClick={()=>toggleExtra(v)}>{v}</span>)}</div>
        {f.extrasWanted.includes('Other')&&<><label>What else? <span className="fpd-opt">(optional)</span></label><input value={f.extrasOther} maxLength={150} onChange={e=>set('extrasOther',e.target.value)}/></>}
        <label>Anything else you'd like us to know? <span className="fpd-opt">(optional)</span></label>
        <textarea value={f.note} maxLength={500} onChange={e=>set('note',e.target.value)}/>
      </section>}

      {step===5&&<section>
        <div className="fpd-steplabel">Step 6 of 6</div>
        <h2>Review your application</h2>
        <p className="fpd-hint">Check this over, then submit.</p>
        <dl className="fpd-review">
          <dt>Name</dt><dd>{f.name}</dd>
          <dt>Phone</dt><dd>{f.phone}</dd>
          <dt>Email</dt><dd>{f.email}</dd>
          <dt>Location</dt><dd>{[f.city,f.state,f.country,f.pin].filter(Boolean).join(', ')}</dd>
          <dt>Found us via</dt><dd>{f.howHeard}{f.howHeardOther?' — '+f.howHeardOther:''}</dd>
          <dt>Genre</dt><dd>{f.genre}</dd>
          <dt>Language</dt><dd>{f.language}</dd>
          <dt>Manuscript stage</dt><dd>{f.stage}</dd>
          {f.completionTime&&<><dt>Expected completion</dt><dd>{f.completionTime}</dd></>}
          <dt>Books planned</dt><dd>{f.booksPlanned}</dd>
          <dt>Author copies</dt><dd>{f.authorCopies}</dd>
          <dt>Extras requested</dt><dd>{f.extrasWanted.join(', ')||'None'}</dd>
          {f.note&&<><dt>Note</dt><dd>{f.note}</dd></>}
        </dl>
      </section>}

      <div className="fpd-nav">
        <button className="fpd-ghost" disabled={step===0} onClick={back}>Back</button>
        <button className="fpd-primary" disabled={busy} onClick={next}>{busy?'Submitting…':step===STEP_LABELS.length-1?'Submit application':'Continue'}<ArrowRight size={16}/></button>
      </div>
    </div>
    <p className="fpd-footnote">This application reserves your place in line. It is not a payment, a purchase, or a guarantee of publication timeline.</p>
  </div>
}

const FPD_CSS=`
.fpd-wrap{--deep:#284f43;--deep2:#1d3a31;--ivory:#f6f3ea;--paper:#fffdf8;--line:#dfe3d7;--accent:#c96a3f;--muted:#5d6b63;--good:#2e7d5b;--ink:#1f2e29;
  background:var(--ivory);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5}
.fpd-wrap h1,.fpd-wrap h2,.fpd-wrap h3{font-family:Georgia,'Times New Roman',serif;margin:0 0 .4em;color:var(--deep2)}
.fpd-wrap p{margin:0 0 1em}
.fpd-hero{background:linear-gradient(180deg,var(--deep2),var(--deep));color:#fff;padding:56px 20px 64px;text-align:center}
.fpd-eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:#cfe0d6;margin-bottom:14px;font-weight:600}
.fpd-hero h1{color:#fff;font-size:clamp(28px,5vw,44px);line-height:1.15;margin:0 auto 16px;max-width:680px}
.fpd-lead{color:#e3ece6;font-size:17px;max-width:560px;margin:0 auto 22px}
.fpd-badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.fpd-badges span{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 14px;font-size:13px}
.fpd-why{max-width:720px;margin:0 auto;padding:40px 20px 10px;text-align:center}
.fpd-why-sub{color:var(--muted);max-width:560px;margin:0 auto}
.fpd-why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px;text-align:left}
.fpd-why-grid div{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px}
.fpd-why-grid h3{font-size:15px;margin-bottom:6px}
.fpd-why-grid p{font-size:13.5px;color:var(--muted);margin:0}
@media (max-width:620px){.fpd-why-grid{grid-template-columns:1fr}}
.fpd-card{max-width:720px;margin:36px auto 0;padding:0 20px}
.fpd-card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(31,46,41,.06);max-width:680px}
.fpd-progress{display:flex;gap:6px;margin-bottom:22px}
.fpd-progress span{flex:1;height:5px;border-radius:4px;background:var(--line)}
.fpd-progress span.done{background:var(--good)}
.fpd-progress span.now{background:var(--accent)}
.fpd-steplabel{font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:600}
.fpd-card h2{font-size:21px;margin-bottom:4px}
.fpd-hint{color:var(--muted);font-size:13.5px;margin-bottom:18px}
.fpd-card label{display:block;font-size:13.5px;font-weight:600;color:var(--deep2);margin:14px 0 6px}
.fpd-opt{font-weight:400;color:var(--muted)}
.fpd-card input,.fpd-card select,.fpd-card textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;font-size:15px;background:#fff;color:var(--ink);font-family:inherit}
.fpd-card textarea{min-height:80px;resize:vertical}
.fpd-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:560px){.fpd-row2{grid-template-columns:1fr}}
.fpd-choices{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.fpd-chip{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 13px;font-size:13.5px;cursor:pointer;user-select:none;display:inline-block}
.fpd-chip.sel{background:var(--deep);border-color:var(--deep);color:#fff}
.fpd-err,.fpd-servererr{color:#b3432f;font-size:13px;margin-top:6px}
.fpd-servererr{background:#fbe9e5;border:1px solid #e3b4a7;border-radius:8px;padding:10px 12px;margin-bottom:14px}
.fpd-nav{display:flex;justify-content:space-between;margin-top:26px;gap:10px}
.fpd-wrap button,.fpd-wrap a.fpd-primary{font-family:inherit;cursor:pointer;border:none;border-radius:999px;padding:12px 22px;font-size:14.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.fpd-primary{background:var(--deep);color:#fff}
.fpd-primary:disabled{opacity:.6;cursor:default}
.fpd-ghost{background:transparent;color:var(--deep);border:1px solid var(--line)}
.fpd-ghost:disabled{opacity:.35;cursor:default}
.fpd-review{display:grid;grid-template-columns:40% 60%;gap:8px 10px;font-size:13.5px;margin:16px 0}
.fpd-review dt{color:var(--muted)}
.fpd-review dd{margin:0;font-weight:600}
.fpd-confirm{max-width:560px;margin:60px auto;padding:0 20px;text-align:center}
.fpd-code{font-family:Georgia,serif;font-size:30px;letter-spacing:.06em;background:var(--ivory);border:2px dashed var(--deep);border-radius:12px;padding:18px 10px;margin:18px 0;color:var(--deep2);font-weight:700}
.fpd-small{font-size:12.5px;color:var(--muted)}
.fpd-footnote{text-align:center;color:var(--muted);font-size:12.5px;padding:24px 20px 50px}
`;
