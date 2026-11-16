'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Existing operations records and API JSON use dynamic shapes. */
import {useEffect,useState} from 'react';
export default function PrintingQueue(){
  const [result,setResult]=useState<any>(null),[error,setError]=useState('');
  async function load(){try{const r=await fetch('/api/printing');const d:any=await r.json();if(!r.ok)throw Error(d.error);setResult(d);setError('')}catch(e:any){setError(e.message)}}
  useEffect(()=>{let active=true;fetch('/api/printing').then(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error);if(active){setResult(d);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  return <section className="panel"><div className="table-tools"><h2>Printing transfer queue</h2><button onClick={load}>Refresh printing queue</button></div>
    {error?<p role="alert">{error}</p>:!result?<p>Loading printing jobs…</p>:<><p>{result.status.enabled?'Enabled · imported orders await printer approval':'Disabled · orders will not be sent automatically'}</p>
    {result.jobs.length?<div className="table-wrap"><table><thead><tr><th>OpenShelf order</th><th>Transfer</th><th>Printer reference</th><th>Review / next action</th></tr></thead><tbody>{result.jobs.map((j:any)=><tr key={j.order_id}><td><a href={'/admin/records/'+encodeURIComponent(j.order_id)}>{j.order_id.slice(0,24)}</a></td><td>{j.state}<small>{j.attempts} transfer attempts</small></td><td>{j.remote_id||'Not received'}</td><td>{j.last_error||(['Queued','Retry','Sending'].includes(j.state)?'Automatic retry when due':'Open the order to sync progress')}</td></tr>)}</tbody></table></div>:<p>No printing transfers queued.</p>}<p className="muted">Latest 100 jobs. Open an order to inspect its files, retry a transfer or sync tracking.</p></>}
  </section>;
}
