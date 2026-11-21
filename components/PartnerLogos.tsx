import React from 'react';
const partners:[string,string][]=[['Amazon','amazon.in'],['Kindle','kindle.amazon.com'],['Google Play Books','play.google.com'],['Apple Books','books.apple.com'],['Rakuten Kobo','kobo.com'],['Barnes & Noble','barnesandnoble.com'],['Everand','everand.com'],['Bookshop.org','bookshop.org'],['OverDrive','overdrive.com'],['hoopla','hoopladigital.com'],['BorrowBox','borrowbox.com'],['cloudLibrary','yourcloudlibrary.com'],['Tolino','tolino.de'],['Vivlio','vivlio.com'],['Gardners','gardners.com'],['Smashwords','smashwords.com'],['Fable','fable.co'],['Books2Read','books2read.com']];
export default function PartnerLogos(){return <section className="osp-partners">
  <div className="osp-partners-head"><h2>Where your book is sold</h2><p>Every book we publish is listed on our own bookstore and sent to these stores and library platforms, in India and worldwide.</p></div>
  <ul>{partners.map(([n,d])=><li key={n}><img src={'https://www.google.com/s2/favicons?sz=64&domain='+d} alt="" width={28} height={28} loading="lazy"/><span>{n}</span></li>)}</ul>
  <p className="osp-partners-fine">Store names and logos belong to their owners. Availability varies by title and format.</p>
</section>}
