'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Existing operations records and API JSON use dynamic shapes. */
import {useEffect,useState} from 'react';
export default function PrintingQueue(){
  const [result,setResult]=useState<any>(null),[error,setError]=useState('');
  const [test,setTest]=useState<any>(null),[testing,setTesting]=useState(false);
  async function testAction(action:string,id?:string){const res=await fetch('/api/printing/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id})});const value:any=await res.json();if(!res.ok)throw Error(value.error);setTest(value.test);return value.test}
  async function runTest(previous?:any){setTesting(true);setError('');let current=previous;try{
    if(!current)current=await testAction('create');
    if(!current.remoteId)current=await testAction('send',current.id);
    current=await testAction('verify',current.id);
    for(let i=0;i<4&&current.stage!=='Delivered';i++)current=await testAction('advance',current.id);
    await testAction('cancel',current.id);
  }catch(e:any){if(current)setTest(current);setError(e.message)}finally{setTesting(false)}}
  async function recentTests(){try{const res=await fetch('/api/printing/test');const value:any=await res.json();if(!res.ok)throw Error(value.error);setTest(value.tests[0]||null)}catch(e:any){setError(e.message)}}
  async function cancelTest(){if(!test)return;setTesting(true);try{await testAction('cancel',test.id);setError('')}catch(e:any){setError(e.message)}finally{setTesting(false)}}
  async function load(){try{const r=await fetch('/api/printing');const d:any=await r.json();if(!r.ok)throw Error(d.error);setResult(d);setError('')}catch(e:any){setError(e.message)}}
  useEffect(()=>{let active=true;fetch('/api/printing').then(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error);if(active){setResult(d);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  return <section className="panel"><div className="table-tools"><h2>Printing transfer queue</h2><button onClick={load}>Refresh printing queue</button></div>
    {error&&<p role="alert">{error}</p>}{!result?<p>Loading printing jobs…</p>:<><p>{result.status.enabled?'Enabled · imported orders await printer approval':'Disabled · orders will not be sent automatically'}</p>
    {result.jobs.length?<div className="table-wrap"><table><thead><tr><th>OpenShelf order</th><th>Transfer</th><th>Printer reference</th><th>Review / next action</th></tr></thead><tbody>{result.jobs.map((j:any)=><tr key={j.order_id}><td><a href={'/admin/records/'+encodeURIComponent(j.order_id)}>{j.order_id.slice(0,24)}</a></td><td>{j.state}<small>{j.attempts} transfer attempts</small></td><td>{j.remote_id||'Not received'}</td><td>{j.last_error||(['Queued','Retry','Sending'].includes(j.state)?'Automatic retry when due':'Open the order to sync progress')}</td></tr>)}</tbody></table></div>:<p>No printing transfers queued.</p>}<p className="muted">Latest 100 jobs. Open an order to inspect its files, retry a transfer or sync tracking.</p></>}
    <hr/><h3>Test the complete printing connection</h3><p>Creates synthetic PDFs and one clearly labelled TEST ONLY WooCommerce order. Uses placeholder ISBN 9780000000002. Tests signed transfer, duplicate protection, private files and simulated status updates, then cancels the test order. No real payment, customer order, print release or courier booking. Requires connector plugin 0.2.0 and matching secrets; automatic printing can stay disabled.</p>
    <div className="button-row"><button disabled={testing||!result?.status.configured} onClick={()=>runTest()}>{testing?'Running test…':'Run full test order'}</button><button disabled={testing} onClick={recentTests}>Show latest test</button>{test&&test.status!=='Complete'&&<><button disabled={testing} onClick={()=>runTest(test)}>Resume this test</button><button disabled={testing||!test.remoteId} onClick={cancelTest}>Cancel test order</button></>}</div>
    {test&&<div role="status"><p><strong>{test.title}</strong> · {test.status} · {test.stage}</p><p>Reference: {test.id}{test.remoteId?' · WooCommerce #'+test.remoteId:''}</p><ol>{test.checks.map((check:string,i:number)=><li key={i}>{check}</li>)}</ol>{test.error&&<p>{test.error}</p>}</div>}
  </section>;
}
