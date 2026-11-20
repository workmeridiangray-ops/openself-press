'use client';
// Staff CRM shell: top bar (global search, create menu, account menu) and the Home dashboard.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,Plus,ChevronDown,LogOut,ExternalLink,ArrowRight} from 'lucide-react';

const PAID=['Paid','In production','Ready to ship','Dispatched','Delivered'];
const CLOSED=['Closed','Resolved','Completed','Converted','Rejected','Archived','Cancelled','Published','Delivered'];
const rupees=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const date=(s:string)=>s?new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'';
const when=(s:string)=>s?new Date(s).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const recordLabel=(r:any)=>r.data?.title||r.data?.name||r.data?.contactName||r.id.slice(0,8);
const contact=(r:any)=>r.data?.contactEmail||r.data?.email||r.data?.author||'';
const initials=(s:string)=>String(s||'?').split(/[\s@.]+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('');

export const crmCreateKinds:[string,string][]=[['Submissions','Submission'],['Publishing','Book project'],['Support','Support ticket'],['Services','Service request'],['Campaigns','Campaign']];

export function CrmTopBar({records,user,onCreate,onNavigate,onSignOut}:{records:any[],user:any,onCreate:(kind:string)=>void,onNavigate:(to:string)=>void,onSignOut:()=>void}){
  const [q,setQ]=useState('');const [open,setOpen]=useState<''|'search'|'create'|'user'>('');const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{const close=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen('')};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[]);
  const results=useMemo(()=>{const t=q.trim().toLowerCase();if(t.length<2)return [];return records.filter((r:any)=>r.kind!=='Notifications'&&[r.id,r.data?.title,r.data?.name,r.data?.author,r.data?.email,r.data?.contactEmail,r.data?.phone,r.data?.isbn].some(v=>String(v||'').toLowerCase().includes(t))).slice(0,8)},[q,records]);
  const go=(to:string)=>{setOpen('');setQ('');onNavigate(to)};
  return <header className="crm-topbar" ref={box}>
    <a className="crm-brand" href="/admin/overview" onClick={e=>{e.preventDefault();go('/admin/overview')}}><img src="/brand/favicon-emblem.png" alt=""/><span>Open Shelf Press</span><em>CRM</em></a>
    <div className="crm-search">
      <Search size={15}/>
      <input aria-label="Search all records" placeholder="Search records by name, email, phone, ISBN or reference" value={q} onFocus={()=>setOpen('search')} onChange={e=>{setQ(e.target.value);setOpen('search')}} onKeyDown={e=>{if(e.key==='Enter'&&results[0])go('/admin/records/'+results[0].id);if(e.key==='Escape')setOpen('')}}/>
      {open==='search'&&q.trim().length>=2&&<div className="crm-menu crm-search-results" role="listbox">
        {results.length?results.map((r:any)=><button key={r.id} role="option" aria-selected={false} onClick={()=>go('/admin/records/'+r.id)}><span className="crm-tag">{r.kind}</span><span className="crm-result-main"><strong>{recordLabel(r)}</strong><small>{[contact(r),r.status].filter(Boolean).join(' · ')}</small></span></button>):<p className="crm-empty-line">No matching records</p>}
      </div>}
    </div>
    <div className="crm-topbar-actions">
      <div className="crm-dropdown">
        <button className="crm-btn crm-btn-primary" aria-expanded={open==='create'} onClick={()=>setOpen(open==='create'?'':'create')}><Plus size={15}/>Create<ChevronDown size={14}/></button>
        {open==='create'&&<div className="crm-menu crm-menu-right">{crmCreateKinds.map(([kind,label])=><button key={kind} onClick={()=>{setOpen('');onCreate(kind)}}>{label}</button>)}</div>}
      </div>
      <div className="crm-dropdown">
        <button className="crm-user" aria-expanded={open==='user'} onClick={()=>setOpen(open==='user'?'':'user')}><span className="crm-avatar">{initials(user?.name||user?.email)}</span><span className="crm-user-name">{user?.name||user?.email}<small>{user?.role==='admin'?'Administrator':'Staff'}</small></span><ChevronDown size={14}/></button>
        {open==='user'&&<div className="crm-menu crm-menu-right"><p className="crm-menu-head">{user?.email}</p><a href="/" target="_blank" rel="noreferrer"><ExternalLink size={14}/>View website</a><button onClick={()=>{setOpen('');onNavigate('/admin/settings')}}>Settings</button><button onClick={onSignOut}><LogOut size={14}/>Sign out</button></div>}
      </div>
    </div>
  </header>;
}

export function CrmHome({records,history,user,onNavigate}:{records:any[],history:any[],user:any,onNavigate:(to:string)=>void}){
  const of=(kinds:string[])=>records.filter((r:any)=>kinds.includes(r.kind));
  const month=new Date();const monthStart=new Date(month.getFullYear(),month.getMonth(),1).getTime();
  const paidThisMonth=of(['Orders']).filter((r:any)=>PAID.includes(r.status)&&new Date(r.data?.paidAt||r.updated).getTime()>=monthStart);
  const kpis:{label:string,value:string|number,note:string,to:string}[]=[
    {label:'New submissions',value:of(['Submissions']).filter((r:any)=>['Received','Uploaded','In review'].includes(r.status)).length,note:'Awaiting review',to:'/admin/submissions'},
    {label:'Open leads',value:of(['Leads','Enquiries','Signups']).filter((r:any)=>!CLOSED.includes(r.status)).length,note:'Leads, enquiries and signups',to:'/admin/leads'},
    {label:'Unpaid orders',value:of(['Orders']).filter((r:any)=>r.status==='Awaiting payment').length,note:'Awaiting payment',to:'/admin/orders'},
    {label:'Revenue this month',value:rupees(paidThisMonth.reduce((n:number,r:any)=>n+Number(r.data?.total||0),0)),note:paidThisMonth.length+' paid order'+(paidThisMonth.length===1?'':'s'),to:'/admin/orders'},
    {label:'Open tickets',value:of(['Support']).filter((r:any)=>!CLOSED.includes(r.status)).length,note:'Support requests',to:'/admin/support'},
  ];
  const attention=records.filter((r:any)=>
    (r.kind==='Submissions'&&['Received','Uploaded','In review'].includes(r.status))||
    (r.kind==='Orders'&&['Paid','In production','Ready to ship'].includes(r.status))||
    (r.kind==='Support'&&!CLOSED.includes(r.status))||
    (r.kind==='Services'&&['Received','Changes requested'].includes(r.status))||
    (['Leads','Enquiries'].includes(r.kind)&&['Received','New'].includes(r.status))
  ).sort((a:any,b:any)=>String(a.updated).localeCompare(String(b.updated))).slice(0,10);
  const stages=['Awaiting payment','Paid','In production','Ready to ship','Dispatched','Delivered'];
  const orders=of(['Orders']);const maxStage=Math.max(1,...stages.map(s=>orders.filter((o:any)=>o.status===s).length));
  const hour=new Date().getHours();
  return <div className="crm-home">
    <div className="crm-page-head"><div><h1>Home</h1><p>{hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'}, {String(user?.name||'').split(' ')[0]||'there'} · {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div></div>
    <div className="crm-kpis">{kpis.map(k=><button key={k.label} className="crm-kpi" onClick={()=>onNavigate(k.to)}><span>{k.label}</span><strong>{k.value}</strong><small>{k.note}</small></button>)}</div>
    <div className="crm-home-grid">
      <section className="crm-card">
        <div className="crm-card-head"><h2>Needs attention</h2><span>{attention.length} item{attention.length===1?'':'s'}, oldest first</span></div>
        {attention.length?<div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Record</th><th>Module</th><th>Status</th><th>Contact</th><th>Last updated</th></tr></thead><tbody>{attention.map((r:any)=><tr key={r.id} className="crm-row-link" onClick={()=>onNavigate('/admin/records/'+r.id)}><td><strong>{recordLabel(r)}</strong></td><td>{r.kind}</td><td><span className="crm-status">{r.status}</span></td><td>{contact(r)}</td><td>{date(r.updated)}</td></tr>)}</tbody></table></div>:<p className="crm-empty-line">Nothing is waiting. New submissions, paid orders and open tickets appear here.</p>}
      </section>
      <section className="crm-card">
        <div className="crm-card-head"><h2>Orders by stage</h2><button className="crm-link" onClick={()=>onNavigate('/admin/orders')}>View orders<ArrowRight size={14}/></button></div>
        <div className="crm-stages">{stages.map(s=>{const n=orders.filter((o:any)=>o.status===s).length;return <div key={s} className="crm-stage"><span>{s}</span><div className="crm-bar"><i style={{width:(n/maxStage*100)+'%'}}/></div><strong>{n}</strong></div>})}</div>
      </section>
    </div>
    <section className="crm-card">
      <div className="crm-card-head"><h2>Recent activity</h2><span>Latest {Math.min(10,history.length)} events</span></div>
      {history.length?<div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Activity</th><th>By</th><th>Date & time</th></tr></thead><tbody>{history.slice(0,10).map((a:any)=>{const linked=records.some((r:any)=>r.id===a.record_id);return <tr key={a.id} className={linked?'crm-row-link':''} onClick={()=>linked&&onNavigate('/admin/records/'+a.record_id)}><td>{a.action}</td><td>{a.actor}</td><td>{when(a.created)}</td></tr>})}</tbody></table></div>:<p className="crm-empty-line">No activity recorded yet.</p>}
    </section>
  </div>;
}

// Sidebar grouping for staff, CRM-style. Item names stay the same so every existing route keeps working.
export const crmNavGroups=[
  {title:'Home',items:['Overview']},
  {title:'Sales',items:['Leads','Enquiries','Signups','Authors','Orders','Invoices','Refunds']},
  {title:'Publishing',items:['Submissions','Publishing','Files','Cover design','ISBN','Catalogue']},
  {title:'Operations',items:['Production','Shipping','Distribution']},
  {title:'Finance',items:['Accounts','Sales','Royalties','Payouts']},
  {title:'Marketing',items:['Campaigns','Reviews']},
  {title:'Support',items:['Support','Services','Notifications']},
  {title:'Setup',items:['Team','Settings']},
];
export const crmNavLabels:Record<string,string>={Overview:'Home',Publishing:'Book projects',Sales:'Book sales',Signups:'Programme signups',Files:'Manuscript files','Cover design':'Cover designs',Accounts:'Accounts & reconciliation',Team:'Users & roles'};
