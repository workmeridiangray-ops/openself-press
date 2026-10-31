'use client';
import React from 'react';
import {BookOpen,ShieldCheck,ArrowUpRight} from 'lucide-react';
export function StaffPortalHeader(){return <header className="staff-portal-header"><a href="/admin/overview" className="brand"><span className="brand-symbol"><img src="/brand/favicon-emblem.png" alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}/></span><span>Publishing operations<small>STAFF & ADMIN PORTAL</small></span></a><div><span className="staff-portal-label"><ShieldCheck size={15}/>Restricted staff access</span><a href="/" className="text-link">View website<ArrowUpRight size={15}/></a></div></header>}
