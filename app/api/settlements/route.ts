/* eslint-disable @typescript-eslint/no-explicit-any -- Staff finance action boundary. */
import {user,staff,reply} from '../../../lib/server';
import {financeOverview,financeReadiness,financeSchema,prepareDailyBatch,approveSupplierCharge,approveDailyBatch,submitDailyBatch,reconcilePayout,resetFailedPayout,addSupplierCredit,acknowledgeBatch,remittanceCSV,saveFinancePolicy,executeCustomerRefund,resolveSupplierHold,cancelPrinterJob,approveRecoveryRefund,voidCancelledCharge,withdrawUnsentBatch} from '../../../lib/settlements';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
  staff(await user());const url=new URL(req.url);
  if(url.searchParams.get('export'))return new Response(await remittanceCSV(url.searchParams.get('export')!),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="printer-remittance.csv"','Cache-Control':'no-store'}});
  return reply(await financeOverview());
}catch(e:any){return reply({error:e.message},403)}}
export async function POST(req:Request){try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);
  const u=await user();staff(u);const b:any=await req.json();
  if(b.action==='health')return reply({readiness:await financeReadiness(true)});
  if(!financeSchema())throw Error('Apply and activate the supplier settlement migration first');
  if(b.action==='sync-order'){const {syncPrintJob}=await import('../../../lib/printing');return reply(await syncPrintJob(b.id));}
  staff(u,true);
  if(b.action==='policy')return reply({policy:await saveFinancePolicy(b,u.email)});
  if(b.action==='approve-charge')return reply(await approveSupplierCharge(b.id,b.revision,u.email));
  if(b.action==='prepare')return reply({batch:await prepareDailyBatch(b.day||undefined,u.email)});
  if(b.action==='approve-batch')return reply(await approveDailyBatch(b.id,u.email));
  if(b.action==='withdraw-batch'){if(!b.confirmed)throw Error('Confirm withdrawal of this unsent manifest');return reply(await withdrawUnsentBatch(b.id,String(b.reason||''),u.email));}
  if(b.action==='submit'){if(!b.confirmed)throw Error('Confirm this exact remittance before sending money');return reply(await submitDailyBatch(b.id,u.email));}
  if(b.action==='reconcile')return reply(await reconcilePayout(b.id));
  if(b.action==='retry'){if(!b.confirmed)throw Error('Confirm review of the provider-confirmed failure/reversal');return reply(await resetFailedPayout(b.id,u.email));}
  if(b.action==='recover-checkout'){const {reconcileCheckout}=await import('../../../lib/checkout-intent');const {razor}=await import('../../../lib/providers');return reply(await reconcileCheckout(b.id,b.providerId,razor));}
  if(b.action==='approve-recovery-refund'){if(!b.confirmed)throw Error('Confirm the captured-payment recovery refund decision');return reply(await approveRecoveryRefund(b.id,String(b.reason||''),u.email));}
  if(b.action==='verify-capture'){const {capturePayment}=await import('../../../lib/providers');const {record}=await import('../../../lib/server');const order=await record(b.id);return reply(await capturePayment(order,order.data.paymentId));}
  if(b.action==='void-charge'){if(!b.confirmed)throw Error('Confirm the agreed cancellation leaves no supplier charge');return reply(await voidCancelledCharge(b.id,String(b.reason||''),u.email));}
  if(b.action==='credit')return reply(await addSupplierCredit(b,u.email));
  if(b.action==='resolve-hold'){if(!b.confirmed)throw Error('Confirm that the supplier invoice remains payable');return reply(await resolveSupplierHold(b.id,String(b.reason||''),u.email));}
  if(b.action==='cancel-print'){if(!b.confirmed)throw Error('Confirm the printer cancellation request');return reply(await cancelPrinterJob(b.id,u.email));}
  if(b.action==='acknowledge')return reply(await acknowledgeBatch(b.id));
  if(b.action==='refund'){if(!b.confirmed)throw Error('Confirm the admin-approved customer refund');return reply(await executeCustomerRefund(b.id,u.email));}
  throw Error('Unknown financial operation');
}catch(e:any){return reply({error:e.message||'Financial operation needs review'},400)}}
