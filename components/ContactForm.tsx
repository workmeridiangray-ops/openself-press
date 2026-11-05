'use client';
import React,{useState} from 'react';
import {ArrowRight,CheckCircle2} from 'lucide-react';
import PhoneInput from './PhoneInput';

export default function ContactForm(){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sent,setSent]=useState(false);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    const f=Object.fromEntries(new FormData(form));
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});
      const d:any=await r.json();
      if(!r.ok)throw Error(d.error||'Could not send your message');
      setSent(true);
    }catch(err:any){setError(err.message)}
    finally{setBusy(false)}
  }

  if(sent)return <section className="panel receipt"><CheckCircle2 size={40}/><h2>Message received</h2><p>Thank you. The publishing team will reply to the email address you gave. You can also write to info@openshelfpress.com.</p></section>;

  return <form className="panel" onSubmit={submit}>
    <div className="form-grid">
      <label>Your name<input name="name" required maxLength={120} autoComplete="name"/></label>
      <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email"/></label>
      <label>Phone (optional)<PhoneInput name="phone" required={false}/></label>
      <label>Subject<input name="subject" maxLength={150}/></label>
      <label className="full">Message<textarea name="message" required minLength={10} maxLength={3000} rows={6}/></label>
    </div>
    <div aria-hidden="true" style={{position:'absolute',left:'-9999px',height:0,overflow:'hidden'}}>
      <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off"/></label>
    </div>
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy?'Sending…':'Send message'}<ArrowRight size={17}/></button>
  </form>;
}
