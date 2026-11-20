/* eslint-disable @typescript-eslint/no-explicit-any -- Staff test actions. */
import {user,staff,reply} from '../../../../lib/server';
import {createPrintingTest,runPrintingTest,printingTests,saveTestError,testId} from '../../../../lib/printing-test';
export const dynamic='force-dynamic';
export async function GET(){try{staff(await user(),true);return reply({tests:await printingTests()})}catch(e:any){return reply({error:e.message},403)}}
export async function POST(req:Request){let id='';try{
  if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('Invalid request origin');
  const u=await user();staff(u,true);const b:any=await req.json();id=String(b.id||'');
  if(b.action==='create')return reply({test:await createPrintingTest(u.userId)});
  return reply({test:await runPrintingTest(id,b.action,u.email)});
}catch(e:any){if(testId(id))try{await saveTestError(id,e.message)}catch{}return reply({error:e.message||'Test failed'},400)}}
