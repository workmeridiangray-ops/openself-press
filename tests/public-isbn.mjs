import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
const dir='.sites-runtime/isbn-tests';mkdirSync(dir,{recursive:true});
for(const [name,path] of Object.entries({model:'lib/public-catalogue.ts',currency:'lib/currency.ts',currencyMap:'lib/currency-map.ts',public:'components/PublicExperience.tsx',detail:'components/BookDetail.tsx'})){
 const source=readFileSync(path,'utf8').replace("'../lib/public-catalogue'","'./model.mjs'").replace("'../lib/currency'","'./currency.mjs'").replace("'./currency-map'","'./currencyMap.mjs'").replace("'./PublicExperience'","'./public.mjs'");
 writeFileSync(dir+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
}
const Detail=(await import('../'+dir+'/detail.mjs')).default;
const render=isbn=>renderToStaticMarkup(React.createElement(Detail,{book:{id:'fixture',title:'Test book',author:'Koko Nest',price:220,stock:10,isbn},books:[],sample:false,signed:false,onAdd:()=>{},onBuy:()=>{}}));
const blank=render('');assert.equal(blank.includes('<dt>ISBN</dt>'),false);assert.equal(blank.includes('978…'),false);
const supplied=render('9780306406157');assert.equal(supplied.includes('<dt>ISBN</dt>'),true);assert.equal(supplied.includes('9780306406157'),true);
console.log('4 public ISBN omission and supplied-value display checks passed');
