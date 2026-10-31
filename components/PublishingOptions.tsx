'use client';
import React from 'react';
import {ArrowRight,CheckCircle2,Feather,Sparkles,Crown,Gift,TrendingUp,Zap} from 'lucide-react';
import {useFormattedPrice} from '../lib/currency';

const SELF_PUBLISH=[
  {
    name:'Free, Forever',
    Icon:Gift,
    priceINR:0,
    tagline:'You bring the manuscript and cover. We make sure it’s print-ready and gets listed.',
    features:[
      'Free ISBN + barcode',
      'PDF size & bleed check',
      'Listed on your author page + Amazon (India)',
      'No cost, no time limit, no catch',
    ],
    route:'Self-guided',
    free:true,
  },
  {
    name:'Self-Publish Plus',
    Icon:TrendingUp,
    priceINR:2999,
    tagline:'A small step up — wider listing and a formatting pass, still fully self-guided.',
    features:[
      'Everything in Free, Forever',
      'Also listed on Flipkart + ebook worldwide (Google Play, Kindle)',
      '1 formatting/layout pass',
      'Priority ISBN & listing review',
      'Selling well on the free tier? We’ll often offer you this upgrade at no cost — ask us.',
    ],
    route:'Self-guided',
  },
];

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
    <p className="reader-price" style={{fontSize:28,margin:'4px 0 2px'}}>{pkg.priceINR===0?'Free':price(pkg.priceINR)}</p>
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
      <p className="lead">Two paths, five packages total — each priced and published up front, with every add-on disclosed the same way. Self-publishing is you, with our tools behind you. Express publishing is us, doing the work with you.</p>
    </section>

    <section style={{margin:'36px 0 20px'}}>
      <p className="eyebrow" style={{display:'flex',alignItems:'center',gap:8}}><Feather size={14}/>SELF-PUBLISHING — YOU DO THE WORK, WE MAKE SURE IT'S DONE RIGHT</p>
      <h2 style={{fontSize:25,margin:'4px 0 8px'}}>Start free. Level up when you're ready.</h2>
      <p className="muted" style={{maxWidth:680}}>Both of these are self-guided — you supply the manuscript and cover either way. The difference is reach and review, not hand-holding.</p>
    </section>
    <div className="publishing-route-cards" style={{gridTemplateColumns:'repeat(2,1fr)',marginBottom:48}}>
      {SELF_PUBLISH.map(p=><PackageCard key={p.name} pkg={p}/>)}
    </div>

    <section style={{margin:'36px 0 20px'}}>
      <p className="eyebrow" style={{display:'flex',alignItems:'center',gap:8}}><Zap size={14}/>EXPRESS PUBLISHING — WE DO THE WORK WITH YOU</p>
      <h2 style={{fontSize:25,margin:'4px 0 8px'}}>Editing, design and a real launch, handled.</h2>
      <p className="muted" style={{maxWidth:680}}>For when you want more than tools — real editing, real design, and someone pushing the launch alongside you.</p>
    </section>
    <div className="publishing-route-cards" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
      {PACKAGES.map(p=><PackageCard key={p.name} pkg={p}/>)}
    </div>

    <section className="public-faq">
      <h2>About these prices</h2>
      {[
        ["What's the actual difference between self-publishing and express publishing?","Self-publishing is you, using our free or low-cost tools, start to finish — you write it, design it, we check it's print-ready and list it. Express publishing is our team doing the editing, design and launch work alongside you, for a higher but still published, transparent price."],
        ['How do I move from the free tier to a paid one?',"Either pay for Self-Publish Plus or the express tier directly, or do well on the free tier first — strong early sales on your own author page and Amazon can earn you an invitation to upgrade at no extra cost. We review free-tier performance regularly."],
        ['Are these prices final, or will there be hidden costs?','What you see is what you pay for that package. Anything outside a package — extra editing rounds, a rush turnaround, additional author copies — is priced and shown to you before you agree to it, never added afterward.'],
        ['Can I buy just one service instead of a package?','Yes. Editing, cover design, ISBN, distribution and marketing are all available individually — contact us or check Author services for current à la carte pricing.'],
        ['Why does Premier cost more than what some competitors charge for similar support?',"It usually doesn't — Premier is priced to come in well under what full-service packages commonly cost elsewhere in India for the same scope of editing, design and global distribution. We'd rather publish the number than make you ask for a quote."],
        ['What does "channel-by-channel royalty statement" mean?',"You'll see exactly what you earned from direct sales, from Amazon/Flipkart, and from international channels, broken out separately — not one blended number."],
      ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  </main>;
}
