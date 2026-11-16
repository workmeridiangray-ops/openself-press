<?php
// Isolated receiver checks. Run: php tests/printing-wordpress.php
// WordPress/WooCommerce persistence and hooks are test adapters; no live store is contacted.
define('ABSPATH','/'); define('OSP_CONNECTOR_ENABLED',true); define('OSP_CONNECTOR_SECRET','synthetic-test-secret-at-least-32-characters');
$hooks=[]; function add_action(...$a) {} function add_filter($hook,$fn,...$a) {global $hooks;$hooks[$hook]=$fn;} function register_activation_hook(...$a) {}
class WooCommerce {}
class WP_Error { public function __construct(public $code,public $message,public $data=[]){} }
function current_time(...$a){return '2026-11-16 00:00:00';}
function admin_url($path){return 'https://onlineprintingz.in/wp-admin/'.$path;}
function add_query_arg($query,$url){return $url.'?'.http_build_query($query);}
function update_post_meta(...$a){} function wp_unslash($s){return $s;}
function wc_get_product($id){return new class {function get_status(){return 'publish';}};}
function WC(){return (object)['countries'=>new class{function get_states($c){return ['WB'=>'West Bengal','GJ'=>'Gujarat'];}}];}
$options=[];function get_option($key){global $options;return $options[$key]??false;}function update_option($key,$value,...$rest){global $options;$options[$key]=$value;}function sanitize_text_field($value){return trim(strip_tags($value));}
$orders=[];$nextId=100;$crash=false;
class WC_Order {
 public $id=0,$via='',$meta=[],$items=[],$status='',$address=[],$total=0;
 function __construct(){}
 function set_created_via($v){$this->via=$v;} function get_created_via(){return $this->via;}
 function get_status(){return $this->status;} function set_currency($v){} function set_status($v){$this->status=$v;}
 function set_payment_method($v){} function set_payment_method_title($v){}
 function update_meta_data($k,$v){$this->meta[$k]=$v;} function get_meta($k){return $this->meta[$k]??'';}
 function set_address($v,$k){$this->address[$k]=$v;} function get_id(){return $this->id;}
 function save(){global $orders,$nextId,$crash;if(!$this->id)$this->id=++$nextId;$orders[$this->id]=$this;if($crash)throw new Exception('Synthetic crash after order save');}
 function add_item($i){$this->items[]=$i;} function calculate_totals($tax){foreach($this->items as $i)$this->total+=$i->total;} function add_order_note($s){}
}
class WC_Order_Item_Product {
 public $meta=[],$quantity=0,$total=0;
 function set_product($p){} function set_name($s){} function set_quantity($n){$this->quantity=$n;}
 function set_subtotal($n){} function set_total($n){$this->total=$n;} function set_taxes($v){}
 function add_meta_data($k,$v,$unique){$this->meta[$k]=$v;}
}
function wc_get_order($id){global $orders;return $orders[$id]??null;}
class TestDB {
 public $prefix='wp_',$rows=[];
 function prepare($query,...$args){return [$query,$args];}
 function get_var($q){return 1;}
 function get_row($q){return $this->rows[$q[1][0]]??null;}
 function insert($table,$data){$this->rows[$data['source_order']]=(object)$data;return 1;}
 function update($table,$data,$where){foreach($data as $k=>$v)$this->rows[$where['source_order']]->$k=$v;return 1;}
}
$wpdb=new TestDB();
class Request implements ArrayAccess {
 function __construct(public $body,public $headers=[],public $id=0){}
 function get_body(){return $this->body;} function get_json_params(){return json_decode($this->body,true);}
 function get_header($k){return $this->headers[$k]??'';} function get_method(){return 'POST';}
 function offsetExists(mixed $o):bool{return $o==='id';} function offsetGet(mixed $o):mixed{return $this->id;}
 function offsetSet(mixed $o,mixed $v):void{} function offsetUnset(mixed $o):void{}
}
require __DIR__.'/../integrations/wordpress/openshelf-print-connector/openshelf-print-connector.php';
$n=0; function eq($a,$b){global $n;if($a!==$b)throw new Exception('Expected '.var_export($b,true).' got '.var_export($a,true));$n++;}
function fails($fn){global $n;try{$fn();}catch(Throwable $e){$n++;return;}throw new Exception('Expected validation rejection');}
$c=['size'=>'A5','paper'=>'Cream','gsm'=>80,'blackPages'=>100,'colourPages'=>0,'lamination'=>'Matte','unitWeightGrams'=>150,'approved'=>true];
$p=['schema'=>1,'mode'=>'hold','currency'=>'INR','sourceOrder'=>'synthetic-order','delivery'=>['name'=>'Synthetic Recipient','address'=>'Synthetic street','city'=>'Kolkata','state'=>'WB','pin'=>'700001','phone'=>'9000000000','country'=>'IN'],'items'=>[['index'=>0,'productId'=>12982,'title'=>'Synthetic Dynamic GK','isbn'=>'9780306406157','trimSize'=>'A5','copies'=>2,'config'=>$c,'cost'=>['unitPaise'=>6300,'totalPaise'=>12600],'files'=>['interior'=>['version'=>1,'filename'=>'interior.pdf'],'cover'=>['version'=>1,'filename'=>'cover.pdf']]]]];
eq(OSP_Print_Connector::cost($c,1),7500);eq(OSP_Print_Connector::cost($c,2),6300);eq(OSP_Print_Connector::cost($c,3),6900);eq(OSP_Print_Connector::cost($c,6),6000);
$bad=$p;$bad['items'][0]['cost']['unitPaise']=1;fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$p;$bad['items'][0]['productId']=1;fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$p;$bad['items'][0]['config']['size']='8x10';fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$p;$bad['items'][0]['config']['approved']=false;fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$p;unset($bad['items'][0]['files']['cover']);fails(fn()=>OSP_Print_Connector::validate($bad));
$raw=json_encode($p,JSON_UNESCAPED_SLASHES);$time=(string)time();$_SERVER['REQUEST_URI']='/wp-json/openshelf/v1/orders';
$sig=hash_hmac('sha256',implode("\n",[$time,'POST',$_SERVER['REQUEST_URI'],hash('sha256',$raw)]),OSP_CONNECTOR_SECRET);
$req=new Request($raw,['x-osp-timestamp'=>$time,'x-osp-signature'=>$sig]);
eq(OSP_Print_Connector::authorised($req),true);
eq(OSP_Print_Connector::authorised(new Request($raw,[]))->code,'osp_auth');
eq(OSP_Print_Connector::authorised(new Request($raw.' ',['x-osp-timestamp'=>$time,'x-osp-signature'=>$sig]))->code,'osp_auth');
eq(OSP_Print_Connector::authorised(new Request($raw,['x-osp-timestamp'=>(string)(time()-301),'x-osp-signature'=>$sig]))->code,'osp_auth');
$result=OSP_Print_Connector::receive($req);eq($result['id'],101);eq(count($orders),1);eq($orders[101]->status,'on-hold');eq($orders[101]->total,126);eq($orders[101]->items[0]->quantity,2);eq($orders[101]->items[0]->meta['Binding'],'Perfect Binding');eq($orders[101]->items[0]->meta['_wcpc_weight_grams'],300);eq($orders[101]->get_meta('wf_order_weight'),0.3);
eq(str_contains($orders[101]->items[0]->meta['Content File'],'action=osp_file'),true);
eq($orders[101]->address['shipping']['postcode'],'700001');
$duplicate=OSP_Print_Connector::receive($req);eq($duplicate['duplicate'],true);eq(count($orders),1);
$changed=$p;$changed['items'][0]['files']['cover']['version']=2;
eq(OSP_Print_Connector::receive(new Request(json_encode($changed)))->code,'osp_conflict');eq(count($orders),1);
$crash=true;$interrupted=$p;$interrupted['sourceOrder']='interrupted-order';$broken=new Request(json_encode($interrupted));
eq(OSP_Print_Connector::receive($broken)->code,'osp_review');eq(count($orders),2);$crash=false;
eq(OSP_Print_Connector::receive($broken)->code,'osp_review');eq(count($orders),2);
$status=OSP_Print_Connector::status(new Request('',[],101));eq($status['stage'],'Awaiting approval');eq($status['revision'],1);eq($status['sourceOrder'],'synthetic-order');
eq(($hooks['woocommerce_email_enabled_customer_on_hold_order'])(true,$orders[101]),false);eq(($hooks['woocommerce_order_needs_payment'])(true,$orders[101]),false);
$values=['osp_invoice'=>'SUP-101','osp_productionPaise'=>'126.00','osp_shippingPaise'=>'50','osp_taxPaise'=>'0','osp_discountPaise'=>'0'];
$charge=OSP_Print_Connector::final_charge($values,1);eq($charge['productionPaise'],12600);eq($charge['shippingPaise'],5000);
$invalid=$values;$invalid['osp_discountPaise']='9999';fails(fn()=>OSP_Print_Connector::final_charge($invalid,1));
$invalid=$values;$invalid['osp_productionPaise']='1.001';fails(fn()=>OSP_Print_Connector::final_charge($invalid,1));
$invalid=$values;unset($invalid['osp_taxPaise']);fails(fn()=>OSP_Print_Connector::final_charge($invalid,1));
$orders[101]->update_meta_data('_osp_charges',$charge);
$manifest=['day'=>'2026-11-16','environment'=>'test','currency'=>'INR','grossPaise'=>17600,'totalPaise'=>17600,'credits'=>[],'items'=>[['orderId'=>'synthetic-order','remoteId'=>101,'invoice'=>'SUP-101','revision'=>1,'amountPaise'=>17600]]];
$rawManifest=json_encode($manifest,JSON_UNESCAPED_SLASHES);
$receipt=['batchId'=>'ps-test-2026-11-16','state'=>'settled','providerId'=>'pout_synthetic','manifestJSON'=>$rawManifest,'manifestHash'=>hash('sha256',$rawManifest),'chunkHash'=>hash('sha256',$rawManifest),'amountPaise'=>17600,'cursor'=>0,'totalItems'=>1,'utr'=>'SYNTHETIC-UTR'];
eq(OSP_Print_Connector::settlement(new Request(json_encode($receipt)))['accepted'],true);
eq($orders[101]->get_meta('_osp_settlement')['state'],'settled');eq($orders[101]->status,'on-hold');
eq(OSP_Print_Connector::settlement(new Request(json_encode($receipt)))['accepted'],true);
$bad=$receipt;$bad['chunkHash']=str_repeat('0',64);eq(OSP_Print_Connector::settlement(new Request(json_encode($bad)))->code,'osp_manifest');
$bad=$receipt;$bad['providerId']='pout_other';eq(OSP_Print_Connector::settlement(new Request(json_encode($bad)))->code,'osp_manifest');
$bad=$receipt;$wrong=$manifest;$wrong['items'][0]['amountPaise']=1;$bad['manifestJSON']=json_encode($wrong);$bad['chunkHash']=hash('sha256',$bad['manifestJSON']);eq(OSP_Print_Connector::settlement(new Request(json_encode($bad)))->code,'osp_manifest');
$receipt['state']='reversed';eq(OSP_Print_Connector::settlement(new Request(json_encode($receipt)))['accepted'],true);eq($orders[101]->get_meta('_osp_settlement')['state'],'reversed');
$receipt['state']='settled';eq(OSP_Print_Connector::settlement(new Request(json_encode($receipt)))->code,'osp_manifest');
// A replacement payout is accepted only after the prior transfer reversed.
$receipt['providerId']='pout_replacement';eq(OSP_Print_Connector::settlement(new Request(json_encode($receipt)))['accepted'],true);eq($orders[101]->status,'on-hold');
$orders[101]->update_meta_data('_osp_stage','In production');
eq(OSP_Print_Connector::cancel(new Request(json_encode(['sourceOrder'=>'synthetic-order']),[],101))->code,'osp_cancel');
$orders[101]->update_meta_data('_osp_stage','Awaiting approval');eq(OSP_Print_Connector::cancel(new Request(json_encode(['sourceOrder'=>'synthetic-order']),[],101))['cancelled'],true);eq($orders[101]->status,'cancelled');eq(OSP_Print_Connector::cancel(new Request(json_encode(['sourceOrder'=>'synthetic-order']),[],101))['cancelled'],true);
echo "$n WordPress receiver checks passed (WordPress/WooCommerce adapters; no live calls)\n";
