/* eslint-disable @typescript-eslint/no-explicit-any -- Private checkout recovery records. */
import {db,secrets,record,audit} from './server';
const time=()=>new Date().toISOString();
type Gateway=(path:string,body?:any)=>Promise<any>;
export async function prepareCheckout(order:any,gateway:Gateway){
  if(order.kind!=='Orders'||order.status!=='Awaiting payment')throw Error('Choose an unpaid customer order');
  if(order.data.paymentRecoveryPending)throw Error('A captured payment is already under review for this order. Do not pay again.');
  const amount=Math.round(order.data.total*100);if(!Number.isSafeInteger(amount)||amount<100)throw Error('Invalid checkout amount');
  if(order.data.providerOrder)return {id:order.data.providerOrder,key:secrets().RAZORPAY_KEY_ID,amount};
  const id='checkout-'+order.id,stamp=time();
  const claim=await db().prepare("INSERT OR IGNORE INTO records VALUES(?,?,'Payment intents','Creating',?,?,?,1)").bind(id,order.owner,JSON.stringify({title:'Checkout intent '+order.id,orderId:order.id,amountPaise:amount}),stamp,stamp).run();
  if(!claim.meta.changes){const intent=await record(id);if(intent.data.providerOrder)return {id:intent.data.providerOrder,key:secrets().RAZORPAY_KEY_ID,amount};throw Error('This checkout is already being prepared or requires reconciliation. Do not create a second payment.')}
  try{
    const remote=await gateway('orders',{amount,currency:'INR',receipt:order.id.slice(0,40),notes:{recordId:order.id}});
    await reconcileCheckout(order.id,remote.id,gateway,remote);
    return {id:remote.id,key:secrets().RAZORPAY_KEY_ID,amount};
  }catch(e){await db().prepare("UPDATE records SET status='Needs reconciliation',data=json_set(data,'$.lastError',?),version=version+1,updated=? WHERE id=? AND json_extract(data,'$.providerOrder') IS NULL").bind(String((e as Error).message).slice(0,300),time(),id).run();throw e;}
}
export async function reconcileCheckout(orderId:string,providerId:string,gateway:Gateway,entity?:any){
  if(!/^order_[A-Za-z0-9]+$/.test(providerId||''))throw Error('Enter the provider order ID, not a payment link');
  const order=await record(orderId),intent=await record('checkout-'+orderId),remote=entity||await gateway('orders/'+providerId);
  if(intent.kind!=='Payment intents'||intent.data.orderId!==orderId||remote.id!==providerId||remote.amount!==Math.round(order.data.total*100)||remote.currency!=='INR'||remote.receipt!==orderId.slice(0,40)||remote.notes?.recordId!==orderId)throw Error('Provider checkout does not match this customer order');
  if(order.data.providerOrder&&order.data.providerOrder!==providerId||intent.data.providerOrder&&intent.data.providerOrder!==providerId)throw Error('A different checkout reference is already linked; reconcile captured payments first');
  await db().batch([db().prepare("UPDATE records SET data=json_set(data,'$.providerOrder',?),version=version+1,updated=? WHERE id=? AND (json_extract(data,'$.providerOrder') IS NULL OR json_extract(data,'$.providerOrder')=?)").bind(providerId,time(),orderId,providerId),db().prepare("UPDATE records SET status='Prepared',data=json_set(data,'$.providerOrder',?,'$.lastError',''),version=version+1,updated=? WHERE id=?").bind(providerId,time(),intent.id)]);
  await audit(orderId,'Razorpay','Linked verified checkout intent '+providerId);return {ok:true};
}
export async function recordUnexpectedCapture(order:any,payment:any){
  if(payment.order_id!==order.data.providerOrder||payment.currency!=='INR'||payment.amount!==Math.round(order.data.total*100)||!['captured','refunded'].includes(payment.status))throw Error('Payment is not captured or does not match this order');
  if(order.data.paymentId===payment.id){await db().prepare("UPDATE records SET data=json_set(data,'$.paymentEnvironment',?),updated=?,version=version+1 WHERE id=?").bind(payment.environment||(String(secrets().RAZORPAY_KEY_ID).startsWith('rzp_live_')?'live':'test'),time(),order.id).run();return {ok:true,alreadyProcessed:true};}
  if(payment.status==='refunded'||Number(payment.amount_refunded||0)>=payment.amount){await audit(order.id,'Razorpay','Fully refunded capture verified; fulfilment remains stopped: '+payment.id);return {ok:true,alreadyRefunded:true};}
  const id='payment-recovery-'+payment.id;
  await db().prepare("INSERT OR IGNORE INTO records VALUES(?,'system','Payment recovery','Needs review',?,?,?,1)").bind(id,JSON.stringify({title:'Captured payment requires resolution',orderId:order.id,paymentId:payment.id,amountPaise:payment.amount-Number(payment.amount_refunded||0),reason:order.status==='Cancelled'?'Captured after order cancellation':payment.amount_refunded?'Refunded before fulfilment':'Additional captured payment on a non-payable order'}),time(),time()).run();
  await db().batch([db().prepare("UPDATE records SET data=json_set(data,'$.paymentRecoveryPending',1),version=version+1,updated=? WHERE id=?").bind(time(),order.id),db().prepare("INSERT OR IGNORE INTO records VALUES(?,?,'Notifications','Unsent',?,?,?,1)").bind('finance-notice-recovery-'+payment.id,order.owner,JSON.stringify({title:'Payment requires review: '+order.data.title,message:'A captured payment requires review against this order. Please do not pay again. The team will reconcile the payment and any refund due.',recordId:order.id,email:order.data.contactEmail||order.data.email||''}),time(),time())]);
  await audit(order.id,'Razorpay','Captured payment held for recovery/refund review: '+payment.id);return {ok:true,recoveryRequired:true};
}
