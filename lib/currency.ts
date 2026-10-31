'use client';
import React,{createContext,useContext,useEffect,useState} from 'react';
export {CURRENCY_BY_COUNTRY,DEFAULT_CURRENCY} from './currency-map';

type CurrencyState={country:string;code:string;symbol:string;locale:string;rate:number;ready:boolean};
const CurrencyContext=createContext<CurrencyState>({country:'IN',code:'INR',symbol:'₹',locale:'en-IN',rate:1,ready:false});

export function CurrencyProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<CurrencyState>({country:'IN',code:'INR',symbol:'₹',locale:'en-IN',rate:1,ready:false});
  useEffect(()=>{
    try{
      const cached=sessionStorage.getItem('osp-currency');
      if(cached){const parsed=JSON.parse(cached);if(Date.now()-parsed.ts<6*60*60*1000){setState({...parsed,ready:true});return}}
    }catch{}
    fetch('/api/geo').then(r=>r.json()).then((d:any)=>{
      const next={country:d.country||'IN',code:d.code||'INR',symbol:d.symbol||'₹',locale:d.locale||'en-IN',rate:d.rate||1};
      setState({...next,ready:true});
      try{sessionStorage.setItem('osp-currency',JSON.stringify({...next,ts:Date.now()}))}catch{}
    }).catch(()=>setState(s=>({...s,ready:true})));
  },[]);
  return React.createElement(CurrencyContext.Provider,{value:state},children);
}

export function useCurrency(){ return useContext(CurrencyContext) }

// Formats an INR amount as the primary price, with an approximate
// local-currency conversion alongside it when the visitor isn't in India.
export function useFormattedPrice(){
  const {code,symbol,locale,rate}=useCurrency();
  const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
  return (amountINR:number)=>{
    const base=inr(amountINR);
    if(code==='INR'||!rate||rate===1)return base;
    const converted=amountINR*rate;
    let approx:string;
    try{approx=new Intl.NumberFormat(locale,{style:'currency',currency:code,maximumFractionDigits:converted>=100?0:2}).format(converted)}
    catch{approx=symbol+converted.toFixed(converted>=100?0:2)}
    return base+'  ≈ '+approx;
  };
}
