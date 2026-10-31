'use client';
import {useEffect} from 'react';
export default function MotionEnhancements({route}:{route:string}){
useEffect(()=>{
 if(typeof IntersectionObserver==='undefined'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const selector='.hero-copy,.hero-visual,.journey-card,.book-card,.auth-card,.book-project,.next-action,.journey-quick-tools>a,.public-book-card,.public-genres>a,.public-authors>a,.publishing-route-card,.public-three-steps>div>article,.public-service-list>details,.public-faq>details,.public-publishing-callout,.section-num-label,.public-hero h1,.public-hero>div>p,.public-hero .hero-actions';
 const targets=new Set<Element>();let frame=0;
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('motion-visible');observer.unobserve(entry.target)}}},{threshold:0.08,rootMargin:'0px 0px 32px 0px'});
 const scan=()=>{frame=0;document.querySelectorAll(selector).forEach((element,index)=>{if(targets.has(element))return;targets.add(element);(element as HTMLElement).style.setProperty('--entrance-delay',Math.min(index%4,3)*40+'ms');element.classList.add('motion-item');observer.observe(element)})};
 scan();const changes=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(scan)});changes.observe(document.body,{subtree:true,childList:true});
 return()=>{changes.disconnect();observer.disconnect();if(frame)cancelAnimationFrame(frame);targets.forEach(element=>{element.classList.remove('motion-item','motion-visible');(element as HTMLElement).style.removeProperty('--entrance-delay')})};
},[route]);
return null;
}
