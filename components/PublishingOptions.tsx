'use client';
import React from 'react';
import {ArrowRight,CheckCircle2,Feather,Sparkles,Crown,Gift} from 'lucide-react';
import {useFormattedPrice} from '../lib/currency';

const PACKAGES=[
  {
    name:'Essential',
    Icon:Feather,
    priceINR:7999,
    tagline:'Bring your own manuscript and cover — we handle the rest.',
    features:[
      'Free ISBN + barcode',
      'PDF size & bleed check',
      'Paperback + ebook formatting',
      'Listed in India: Amazon, Flipkart, our store',
      'Ebook worldwide: Google Play Books, Kindle',
      '1 round of file correction before print',
      'Author copies at printing cost',
    ],
    route:'Self-guided',
  },
  {
    name:'Signature',
    Icon:Sparkles,
    priceINR:27999,
    tagline:'A professional look and one real editing pass, without the wait.',
    features:[
      'Everything in Essential',
      'Professional cover design (2 concepts, 1 revision)',
      'One full copyediting pass',
      'International paperback distribution',
      'Your own author page on our site',
      'Launch starter kit: social graphics + listing optimization',
    ],
    route:'Self-guided',
    popular:true,
  },
  {
    name:'Premier',
    Icon:Crown,
    priceINR:54999,
    tagline:'Full editorial support, priority production, and a real launch push.',
    features:[
      'Everything in Signature',
      'Developmental editing + copyediting, full manuscript',
      'Premium cover design (3 concepts, unlimited revisions)',
      'Priority production — fastest end of our 7–15 day window',
      'Global distribution, all channels',
      'Launch push: ad credit, press/PR outreach',
      'Channel-by-channel royalty statement from day one',
    ],
    route:'Expert',
  },
];

function PackageCard({pkg}:{pkg:typeof PACKAGES[number]}){
  const price=useFormattedPrice();
  const Icon=pkg.Icon;
  return <section className={'panel publishing-route-card'+(pkg.popular?' selected':'')} style={pkg.popular?{borderColor:'var(--accent)',boxShadow:'0 0 0 2px var(--accent)'}:{}}>
    {pkg.popular&&<span className="badge success" style={{marginBottom:10}}>Most chosen</span>}
    <span className="public-route-icon"><Icon size={32}/></span>
    <h2>{pkg.name}</h2>
    <p className="reader-price" style={{fontSize:28,margin:'4px 0 2px'}}>{price(pkg.priceINR)}</p>
    <p>{pkg.tagline}</p>
    <ul>{pkg.features.map(f=><li key={f}><CheckCircle2 size={16}/>{f}</li>)}</ul>
    <a className="primary" href={'/submit?route='+pkg.route+'&package='+encodeURIComponent(pkg.name)}>Choose {pkg.name}<ArrowRight size={16}/></a>
  </section>;
}

export default function PublishingOptions(){
  return <main className="public-page-body publishing-routes">
    <section className="public-publish-hero">
      <p className="eyebrow">PUBLISHING PACKAGES</p>
      <h1>Clear prices. No "get a quote" forms.</h1>
      <p className="lead">Three packages that scale with how much help you want — each one priced and published up front, with every add-on disclosed the same way.</p>
    </section>

    <section className="public-publishing-callout" style={{marginTop:0,marginBottom:40,textAlign:'left',display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
      <Gift size={32}/>
      <div style={{flex:1,minWidth:240}}>
        <h2 style={{fontSize:20,margin:'0 0 6px'}}>Can't pay anything right now?</h2>
        <p style={{margin:0}}>Our free self-guided tier is always open — ISBN, basic formatting tools and domestic listing, at no cost, no time limit. <a className="text-link" href="/free-publishing" style={{display:'inline-flex'}}>See the 100 free publishing slots<ArrowRight size={14}/></a></p>
      </div>
    </section>

    <div className="publishing-route-cards" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
      {PACKAGES.map(p=><PackageCard key={p.name} pkg={p}/>)}
    </div>

    <section className="public-faq">
      <h2>About these prices</h2>
      {[
        ['Are these prices final, or will there be hidden costs?','What you see is what you pay for that package. Anything outside a package — extra editing rounds, a rush turnaround, additional author copies — is priced and shown to you before you agree to it, never added afterward.'],
        ['Can I buy just one service instead of a package?','Yes. Editing, cover design, ISBN, distribution and marketing are all available individually — contact us or check Author services for current à la carte pricing.'],
        ['Why does Premier cost more than what some competitors charge for similar support?',"It usually doesn't — Premier is priced to come in well under what full-service packages commonly cost elsewhere in India for the same scope of editing, design and global distribution. We'd rather publish the number than make you ask for a quote."],
        ['What does "channel-by-channel royalty statement" mean?',"You'll see exactly what you earned from direct sales, from Amazon/Flipkart, and from international channels, broken out separately — not one blended number."],
      ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  </main>;
}
