// Country -> local currency. Shared between the client currency hook
// and the server geo-detection route. Base pricing on the site is
// always INR; this only controls what approximate conversion is shown.
export const CURRENCY_BY_COUNTRY:Record<string,{code:string;symbol:string;locale:string}>={
  IN:{code:'INR',symbol:'₹',locale:'en-IN'},
  US:{code:'USD',symbol:'$',locale:'en-US'},
  GB:{code:'GBP',symbol:'£',locale:'en-GB'},
  AE:{code:'AED',symbol:'AED',locale:'ar-AE'},
  SA:{code:'SAR',symbol:'SAR',locale:'ar-SA'},
  CA:{code:'CAD',symbol:'CA$',locale:'en-CA'},
  AU:{code:'AUD',symbol:'A$',locale:'en-AU'},
  NZ:{code:'NZD',symbol:'NZ$',locale:'en-NZ'},
  SG:{code:'SGD',symbol:'S$',locale:'en-SG'},
  MY:{code:'MYR',symbol:'RM',locale:'ms-MY'},
  AT:{code:'EUR',symbol:'€',locale:'de-AT'},BE:{code:'EUR',symbol:'€',locale:'nl-BE'},CY:{code:'EUR',symbol:'€',locale:'el-CY'},DE:{code:'EUR',symbol:'€',locale:'de-DE'},EE:{code:'EUR',symbol:'€',locale:'et-EE'},ES:{code:'EUR',symbol:'€',locale:'es-ES'},FI:{code:'EUR',symbol:'€',locale:'fi-FI'},FR:{code:'EUR',symbol:'€',locale:'fr-FR'},GR:{code:'EUR',symbol:'€',locale:'el-GR'},IE:{code:'EUR',symbol:'€',locale:'en-IE'},IT:{code:'EUR',symbol:'€',locale:'it-IT'},NL:{code:'EUR',symbol:'€',locale:'nl-NL'},PT:{code:'EUR',symbol:'€',locale:'pt-PT'},
  CH:{code:'CHF',symbol:'CHF',locale:'de-CH'},
  JP:{code:'JPY',symbol:'¥',locale:'ja-JP'},
  CN:{code:'CNY',symbol:'¥',locale:'zh-CN'},
  ZA:{code:'ZAR',symbol:'R',locale:'en-ZA'},
  NP:{code:'NPR',symbol:'Rs',locale:'ne-NP'},
  BD:{code:'BDT',symbol:'৳',locale:'bn-BD'},
  LK:{code:'LKR',symbol:'Rs',locale:'si-LK'},
  QA:{code:'QAR',symbol:'QR',locale:'ar-QA'},
  KW:{code:'KWD',symbol:'KD',locale:'ar-KW'},
  OM:{code:'OMR',symbol:'OMR',locale:'ar-OM'},
  BH:{code:'BHD',symbol:'BD',locale:'ar-BH'},
};
export const DEFAULT_CURRENCY={code:'USD',symbol:'$',locale:'en-US'};

// Static fallback rates (INR -> currency), used only if the live rate
// fetch fails. Approximate; refreshed whenever the live source responds.
export const FALLBACK_RATES:Record<string,number>={
  USD:0.012,EUR:0.011,GBP:0.0095,AED:0.044,SAR:0.045,CAD:0.0165,AUD:0.018,NZD:0.02,
  SGD:0.016,MYR:0.053,CHF:0.0105,JPY:1.78,CNY:0.086,ZAR:0.22,NPR:1.6,BDT:1.46,LKR:3.5,
  QAR:0.044,KWD:0.0037,OMR:0.0046,BHD:0.0045,INR:1,
};
