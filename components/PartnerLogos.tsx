import React from 'react';
const partners:[string,string][]=[['Amazon','amazon.in'],['Kindle','kindle.amazon.com'],['Google Play Books','play.google.com'],['Apple Books','books.apple.com'],['Rakuten Kobo','kobo.com'],['Barnes & Noble','barnesandnoble.com'],['Everand','everand.com'],['Bookshop.org','bookshop.org'],['OverDrive','overdrive.com'],['hoopla','hoopladigital.com'],['BorrowBox','borrowbox.com'],['cloudLibrary','yourcloudlibrary.com'],['Tolino','tolino.de'],['Vivlio','vivlio.com'],['Gardners','gardners.com'],['Smashwords','smashwords.com'],['Fable','fable.co'],['Books2Read','books2read.com']];
export default function PartnerLogos(){return <section style={{maxWidth:1296,margin:'0 auto',padding:'70px 5% 56px',textAlign:'center',background:'linear-gradient(180deg,#faf8f3,#fff)',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)'}}>
  <p className="eyebrow" style={{justifyContent:'center'}}>OUR DISTRIBUTION PARTNERS</p>
  <h2 style={{fontSize:44,margin:'8px 0 12px'}}>Your book, on the shelves readers already use.</h2>
  <p className="muted" style={{maxWidth:560,margin:'0 auto 28px',fontSize:15}}>We distribute your book in print and as an eBook to leading stores and library platforms in India and around the world.</p>
  <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:16}}>
    {partners.map(([n,d])=><span key={n} style={{display:'inline-flex',alignItems:'center',gap:12,padding:'13px 22px 13px 14px',border:'1px solid var(--line)',borderRadius:50,background:'#fff',fontSize:16,fontWeight:600,boxShadow:'0 4px 14px rgba(32,31,24,.06)',color:'var(--ink)'}}><img src={'https://www.google.com/s2/favicons?sz=64&domain='+d} alt="" width={32} height={32} style={{borderRadius:7}} loading="lazy"/>{n}</span>)}
  </div>
  <p className="muted" style={{fontSize:10,marginTop:18}}>Store names and logos belong to their respective owners. Availability varies by title and format.</p>
</section>}
