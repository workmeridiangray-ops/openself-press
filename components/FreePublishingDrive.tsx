'use client';
import React,{useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,BookOpen,Sparkles,ShieldCheck} from 'lucide-react';

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
    return <main className="content-section page-content book-start" style={{maxWidth:640}}>
      <p className="eyebrow">APPLICATION RECEIVED</p>
      <h1>You're in. Welcome.</h1>
      <p className="lead">Save this access code — you'll use it later to activate your free publishing slot when it's your turn.</p>
      <section className="panel" style={{textAlign:'center'}}>
        <div className="next-action" style={{margin:'0 0 20px'}}>
          <span style={{fontFamily:'Georgia,serif',fontSize:30,letterSpacing:'.06em',fontWeight:700,color:'var(--ink)'}}>{code}</span>
        </div>
        <button className="text-button" onClick={copyCode}>{copied?'Copied!':'Copy code'}</button>
        <p className="muted" style={{marginTop:10}}>Your application has been recorded.</p>
        <div style={{marginTop:22}}>
          <a className="primary" href={'/login?next='+encodeURIComponent('/submit?code='+code)} target="_top">Continue to submit your manuscript<ArrowRight size={16}/></a>
        </div>
        <p className="muted" style={{marginTop:14,fontSize:13}}>Ready now? Log in or create your author account with the same email, and your code carries through automatically.</p>
      </section>
    </main>
  }

  return <main className="content-section page-content book-start">
    <p className="eyebrow">FOR WRITERS WHO WERE WAITING FOR THIS</p>
    <h1>Your book has been waiting long enough.</h1>
    <p className="lead">Finishing a manuscript is hard enough without wondering how you'll ever afford to publish it. For the next 100 writers who apply, we're taking that question off the table completely — no publishing fee, no hidden cost, no catch. Just your story, made real.</p>

    <div className="three-col" style={{margin:'28px 0 40px'}}>
      <article className="journey-card"><Sparkles size={25}/><h3>Nothing to pay</h3><p>The cost of publishing your book is ours to carry, not yours — from edit to finished copy.</p></article>
      <article className="journey-card"><BookOpen size={25}/><h3>It stays yours</h3><p>Your name on the cover, your rights in your hands, your royalties in your account.</p></article>
      <article className="journey-card"><ShieldCheck size={25}/><h3>Done properly</h3><p>Real editing, real cover design, a real print and ebook release — not a shortcut.</p></article>
    </div>

    <ol className="journey-progress" style={{gridTemplateColumns:'repeat(6,1fr)'}}>
      {STEP_LABELS.map((label,i)=><li key={label} className={i===step?'active':i<step?'done':''}><span>{i<step?<CheckCircle2 size={14}/>:i+1}</span>{label}</li>)}
    </ol>

    <form className="panel" onSubmit={e=>{e.preventDefault();next()}}>
      {serverError&&<p role="alert" className="studio-error">{serverError}</p>}

      {step===0&&<>
        <h2>About you</h2>
        <p className="muted">So we know who's applying.</p>
        <div className="form-grid">
          <label className="full">Full name<input value={f.name} maxLength={120} onChange={e=>set('name',e.target.value)} autoComplete="name"/>{errors.name&&<small style={{color:'#b3432f'}}>Please enter your full name.</small>}</label>
          <label>Phone number<input value={f.phone} maxLength={20} onChange={e=>set('phone',e.target.value)} autoComplete="tel"/>{errors.phone&&<small style={{color:'#b3432f'}}>Please enter a valid phone number.</small>}</label>
          <label>Email address<input value={f.email} maxLength={200} onChange={e=>set('email',e.target.value)} autoComplete="email"/>{errors.email&&<small style={{color:'#b3432f'}}>Please enter a valid email.</small>}</label>
        </div>
      </>}

      {step===1&&<>
        <h2>Where are you writing from?</h2>
        <div className="form-grid">
          <label>Country<input value={f.country} maxLength={80} onChange={e=>set('country',e.target.value)} autoComplete="country-name"/>{errors.country&&<small style={{color:'#b3432f'}}>Please enter your country.</small>}</label>
          <label>State<input value={f.state} maxLength={80} onChange={e=>set('state',e.target.value)} autoComplete="address-level1"/>{errors.state&&<small style={{color:'#b3432f'}}>Please enter your state.</small>}</label>
          <label>City<input value={f.city} maxLength={80} onChange={e=>set('city',e.target.value)} autoComplete="address-level2"/>{errors.city&&<small style={{color:'#b3432f'}}>Please enter your city.</small>}</label>
          <label>PIN / ZIP code<input value={f.pin} maxLength={12} onChange={e=>set('pin',e.target.value)} autoComplete="postal-code"/>{errors.pin&&<small style={{color:'#b3432f'}}>Please enter your PIN/ZIP code.</small>}</label>
        </div>
      </>}

      {step===2&&<>
        <h2>How did you hear about us?</h2>
        <fieldset className="start-manuscript-status">
          <legend>Choose one</legend>
          {HOW_HEARD.map(v=><label className="checkbox" key={v}><input type="radio" name="howHeard" checked={f.howHeard===v} onChange={()=>set('howHeard',v)}/>{v}</label>)}
        </fieldset>
        {errors.howHeard&&<p style={{color:'#b3432f',fontSize:13}}>Please select one.</p>}
        <div className="form-grid" style={{marginTop:16}}>
          {f.howHeard==='Other'&&<label>Tell us where (optional)<input value={f.howHeardOther} maxLength={120} onChange={e=>set('howHeardOther',e.target.value)}/></label>}
          <label>Your handle on that platform (optional)<input value={f.handle} maxLength={100} placeholder="@yourname" onChange={e=>set('handle',e.target.value)}/></label>
        </div>
      </>}

      {step===3&&<>
        <h2>Your manuscript</h2>
        <div className="form-grid">
          <label>Genre / category<select value={f.genre} onChange={e=>set('genre',e.target.value)}><option value="">Select one</option>{GENRES.map(g=><option key={g}>{g}</option>)}</select>{errors.genre&&<small style={{color:'#b3432f'}}>Please choose a genre.</small>}</label>
          <label>Manuscript language<select value={f.language} onChange={e=>set('language',e.target.value)}><option value="">Select one</option>{LANGUAGES.map(l=><option key={l}>{l}</option>)}</select>{errors.language&&<small style={{color:'#b3432f'}}>Please choose a language.</small>}</label>
          <label>What stage is your manuscript at?<select value={f.stage} onChange={e=>set('stage',e.target.value)}><option value="">Select one</option>{STAGES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{errors.stage&&<small style={{color:'#b3432f'}}>Please select your manuscript's stage.</small>}</label>
          {f.stage&&f.stage!=='Complete'&&<label>If it's not finished yet, when do you expect to complete it?<select value={f.completionTime} onChange={e=>set('completionTime',e.target.value)}><option value="">Select one</option>{COMPLETION_TIMES.map(c=><option key={c}>{c}</option>)}</select></label>}
          <label>How many books are you planning to publish with us?<select value={f.booksPlanned} onChange={e=>set('booksPlanned',e.target.value)}><option value="">Select one</option>{BOOKS_PLANNED.map(b=><option key={b}>{b}</option>)}</select>{errors.booksPlanned&&<small style={{color:'#b3432f'}}>Please make a selection.</small>}</label>
        </div>
      </>}

      {step===4&&<>
        <h2>Copies & extras</h2>
        <div className="form-grid">
          <label>How many author copies are you planning to order for yourself?<input type="number" min={0} max={500} placeholder="e.g. 10" value={f.authorCopies} onChange={e=>set('authorCopies',e.target.value)}/>{errors.authorCopies&&<small style={{color:'#b3432f'}}>Please enter a number (0 or more).</small>}</label>
        </div>
        <fieldset className="start-manuscript-status" style={{marginTop:16}}>
          <legend>Want anything shipped along with your books? (select all that apply)</legend>
          {EXTRAS.map(v=><label className="checkbox" key={v}><input type="checkbox" checked={f.extrasWanted.includes(v)} onChange={()=>toggleExtra(v)}/>{v}</label>)}
        </fieldset>
        <div className="form-grid" style={{marginTop:16}}>
          {f.extrasWanted.includes('Other')&&<label>What else? (optional)<input value={f.extrasOther} maxLength={150} onChange={e=>set('extrasOther',e.target.value)}/></label>}
          <label className="full">Anything else you'd like us to know? (optional)<textarea value={f.note} maxLength={500} onChange={e=>set('note',e.target.value)}/></label>
        </div>
      </>}

      {step===5&&<>
        <h2>Review your application</h2>
        <p className="muted">Check this over, then submit.</p>
        <dl className="review-list">
          <div><dt>Name</dt><dd>{f.name}</dd></div>
          <div><dt>Phone</dt><dd>{f.phone}</dd></div>
          <div><dt>Email</dt><dd>{f.email}</dd></div>
          <div><dt>Location</dt><dd>{[f.city,f.state,f.country,f.pin].filter(Boolean).join(', ')}</dd></div>
          <div><dt>Found us via</dt><dd>{f.howHeard}{f.howHeardOther?' — '+f.howHeardOther:''}</dd></div>
          <div><dt>Genre</dt><dd>{f.genre}</dd></div>
          <div><dt>Language</dt><dd>{f.language}</dd></div>
          <div><dt>Manuscript stage</dt><dd>{f.stage}</dd></div>
          {f.completionTime&&<div><dt>Expected completion</dt><dd>{f.completionTime}</dd></div>}
          <div><dt>Books planned</dt><dd>{f.booksPlanned}</dd></div>
          <div><dt>Author copies</dt><dd>{f.authorCopies}</dd></div>
          <div><dt>Extras requested</dt><dd>{f.extrasWanted.join(', ')||'None'}</dd></div>
          {f.note&&<div><dt>Note</dt><dd>{f.note}</dd></div>}
        </dl>
      </>}

      <div className="journey-actions">
        <button type="button" disabled={step===0} onClick={back}><ArrowLeft size={16}/>Back</button>
        <button className="primary" disabled={busy}>{busy?'Submitting…':step===STEP_LABELS.length-1?'Submit application':'Continue'}<ArrowRight size={16}/></button>
      </div>
    </form>
    <p className="muted" style={{textAlign:'center',marginTop:20,fontSize:13}}>This just reserves your place in line — no payment, no obligation, and no fixed publishing date yet. We'll be in touch.</p>
  </main>
}
