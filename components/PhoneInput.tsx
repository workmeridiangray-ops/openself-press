'use client';
import React,{useState} from 'react';

// Country dial codes, most common first. The stored value is "+<code> <number>", e.g. "+91 9876543210".
const COUNTRIES:[string,string][]=[['India','+91'],['United States','+1'],['Canada','+1'],['United Kingdom','+44'],['Australia','+61'],['New Zealand','+64'],['Ireland','+353'],['Singapore','+65'],['Malaysia','+60'],['United Arab Emirates','+971'],['Saudi Arabia','+966'],['Qatar','+974'],['Kuwait','+965'],['Oman','+968'],['Bahrain','+973'],['Nepal','+977'],['Sri Lanka','+94'],['Bangladesh','+880'],['Pakistan','+92'],['Bhutan','+975'],['Maldives','+960'],['Afghanistan','+93'],['Germany','+49'],['France','+33'],['Italy','+39'],['Spain','+34'],['Portugal','+351'],['Netherlands','+31'],['Belgium','+32'],['Switzerland','+41'],['Austria','+43'],['Sweden','+46'],['Norway','+47'],['Denmark','+45'],['Finland','+358'],['Poland','+48'],['Czechia','+420'],['Greece','+30'],['Turkey','+90'],['Russia','+7'],['Ukraine','+380'],['Israel','+972'],['Egypt','+20'],['South Africa','+27'],['Nigeria','+234'],['Kenya','+254'],['Ghana','+233'],['Ethiopia','+251'],['Tanzania','+255'],['Uganda','+256'],['Morocco','+212'],['Mauritius','+230'],['China','+86'],['Hong Kong','+852'],['Taiwan','+886'],['Japan','+81'],['South Korea','+82'],['Thailand','+66'],['Vietnam','+84'],['Indonesia','+62'],['Philippines','+63'],['Myanmar','+95'],['Cambodia','+855'],['Mexico','+52'],['Brazil','+55'],['Argentina','+54'],['Chile','+56'],['Colombia','+57'],['Peru','+51'],['Jamaica','+1876'],['Trinidad and Tobago','+1868'],['Fiji','+679'],['Iran','+98'],['Iraq','+964'],['Jordan','+962'],['Lebanon','+961'],['Hungary','+36'],['Romania','+40'],['Bulgaria','+359'],['Serbia','+381'],['Croatia','+385'],['Iceland','+354'],['Luxembourg','+352']];
const CODES=[...new Set(COUNTRIES.map(c=>c[1]))].sort((a,b)=>b.length-a.length);

function parse(value:string){
  const v=String(value||'').trim();
  if(!v.startsWith('+'))return {code:'',num:v};
  const code=CODES.find(c=>v.startsWith(c))||'';
  return {code,num:v.slice(code.length).trim()};
}

export default function PhoneInput({value,onChange,name,id,required=true}:{value?:string,onChange?:(v:string)=>void,name?:string,id?:string,required?:boolean}){
  const [inner,setInner]=useState(value||'');
  const current=onChange?(value||''):inner;
  const parsed=parse(current);
  const [code,setCode]=useState(parsed.code||'+91');
  const num=parsed.num;
  const emit=(c:string,n:string)=>{const v=n?c+' '+n:'';onChange?onChange(v):setInner(v)};
  return <span className="phone-input">
    <select aria-label="Country code" value={code} onChange={e=>{setCode(e.target.value);emit(e.target.value,num)}}>
      {COUNTRIES.map(([country,dial],i)=><option key={country+i} value={dial}>{country} ({dial})</option>)}
    </select>
    <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" required={required} maxLength={15} placeholder="Phone number" value={num} onChange={e=>emit(code,e.target.value.replace(/[^\d ()-]/g,''))}/>
    {name&&<input type="hidden" name={name} value={current}/>}
  </span>;
}
