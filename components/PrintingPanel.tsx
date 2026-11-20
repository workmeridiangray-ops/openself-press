'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Existing operations records and API JSON use dynamic shapes. */
import {useState,useEffect} from 'react';

export default function PrintingPanel({record:r,refresh,onMessage,onError}:{record:any,refresh:()=>Promise<void>,onMessage:(s:string)=>void,onError:(s:string)=>void}) {
  const [busy,setBusy]=useState(false),[jobs,setJobs]=useState<any[]>([]),[status,setStatus]=useState<any>(null);
  async function load(){const res=await fetch('/api/printing?order='+encodeURIComponent(r.id));const v:any=await res.json();if(res.ok){setJobs(v.jobs);setStatus(v.status)}}
  const id=r.id,version=r.version;
  useEffect(()=>{let active=true;fetch('/api/printing?order='+encodeURIComponent(id)).then(async res=>{const v:any=await res.json();if(res.ok&&active){setJobs(v.jobs);setStatus(v.status)}}).catch(()=>{});return()=>{active=false}},[id,version]);
  async function act(body:any){setBusy(true);try{const res=await fetch('/api/printing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,id:r.id})});const v:any=await res.json();if(!res.ok)throw Error(v.error);await load();await refresh();onMessage('Printing record updated')}catch(e:any){onError(e.message)}finally{setBusy(false)}}
  if(!['Orders','Publishing'].includes(r.kind))return null;
  const job=jobs.find(j=>j.order_id===r.id),c=r.data.printingConfig||{};
  return <section className="panel"><h2>OnlinePrintingz connection</h2><p>{status?.enabled?'Active · printer approval required':'Not activated · no automatic printing transfer'}</p>
    {r.kind==='Publishing'?<form key={r.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'configure-edition',version:r.version,config:{size:f.get('size'),paper:f.get('paper'),gsm:Number(f.get('gsm')),blackPages:Number(f.get('blackPages')),colourPages:Number(f.get('colourPages')),lamination:f.get('lamination'),unitWeightGrams:Number(f.get('weight')),approved:f.get('approved')==='on'}})}}>
      <p>Approve the actual trim-to-price mapping and paper before accepting orders. Custom sizes have no automatic substitute. Paperback (perfect-bound) and Hardcase (case-bound, A4/A5) editions with final approved PDFs are supported.</p>
      <div className="form-grid">
        <label>Priced size<select name="size" defaultValue={c.size||''} required><option value="">Choose size</option>{['A5','A4','B5','6x9','B6'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Paper specification<input name="paper" defaultValue={c.paper||''} maxLength={120} required placeholder="e.g. cream uncoated"/></label>
        <label>Paper GSM<input name="gsm" type="number" min={50} max={400} defaultValue={c.gsm||''} required/></label>
        <label>B&amp;W pages<input name="blackPages" type="number" min={0} max={2000} defaultValue={c.blackPages??''} required/></label>
        <label>Colour pages<input name="colourPages" type="number" min={0} max={2000} defaultValue={c.colourPages??''} required/></label>
        <label>Lamination<select name="lamination" defaultValue={c.lamination||'Matte'}><option>Matte</option><option>Gloss</option></select></label>
        <label>One-copy weight (grams)<input name="weight" type="number" min={0.1} max={10000} step={0.1} defaultValue={c.unitWeightGrams||''} required/></label>
      </div>
      <label className="checkbox"><input name="approved" type="checkbox" required/>I checked the size, paper, page counts and weight against this edition. Prices exclude shipping and taxes.</label>
      <button disabled={busy} className="primary">Approve printing configuration</button>
    </form>:<><p>Transfer: <strong>{job?.state||'Not queued'}</strong>{job?.remote_id?' · WooCommerce #'+job.remote_id:''}</p>{r.data.printingStage&&<p>Printer stage: {r.data.printingStage}</p>}{job?.last_error&&<p role="alert">{job.last_error}</p>}
      <div className="button-row">
        {['Paid','Awaiting payment'].includes(r.status)&&!job&&<button disabled={busy} onClick={()=>act({action:'prepare-existing',confirmed:true})}>Confirm current approved files for this existing order</button>}
        {r.status==='Paid'&&job&&!job.remote_id&&<button disabled={busy||!status?.enabled} onClick={()=>act({action:job.state==='Review'?'retry':'transfer'})}>Transfer / retry printing job</button>}
        {job?.remote_id&&<button disabled={busy||!status?.enabled} onClick={()=>act({action:'sync'})}>Sync printer and tracking</button>}
      </div><p className="muted">Imported orders wait for printer approval. A transfer does not settle production charges or book a courier. Legacy orders use the explicitly reviewed current PDFs.</p></>}
  </section>;
}
