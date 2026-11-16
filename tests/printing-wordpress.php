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
$orders=[];$nextId=100;$crash=false;
class WC_Order {
 public $id=0,$via='',$meta=[],$items=[],$status='',$address=[],$total=0;
 function __construct(){}
 function set_created_via($v){$this->via=$v;} function get_created_via(){return $this->via;}
 function set_currency($v){} function set_status($v){$this->status=$v;} function get_status(){return $this->status;}
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


// Test orders must never become real production, customer payment or shipping orders.
$test=$p;$test['sourceOrder']='osp-test-00000000-0000-4000-8000-000000000001';$test['testMode']=true;
$test['delivery']=['name'=>'TEST ONLY','address'=>'TEST ONLY - DO NOT SHIP','city'=>'Kolkata','state'=>'WB','pin'=>'700001','phone'=>'0000000000','country'=>'IN'];
$test['items'][0]['title']='TEST ONLY - Connector exercise';$test['items'][0]['isbn']='9780000000002';$test['items'][0]['copies']=1;
$test['items'][0]['config']['size']='A4';$test['items'][0]['config']['blackPages']=42;$test['items'][0]['config']['unitWeightGrams']=30;
$test['items'][0]['cost']=['unitPaise'=>7140,'totalPaise'=>7140];
$testBytes=['interior'=>'%PDF-1.4 synthetic interior','cover'=>'%PDF-1.4 synthetic cover'];
foreach($testBytes as $kind=>$bytes)$test['items'][0]['files'][$kind]['sha256']=hash('sha256',$bytes);
$testRequest=new Request(json_encode($test));$received=OSP_Print_Connector::receive($testRequest);eq($received['testMode'],true);$testId=$received['id'];
$duplicate=OSP_Print_Connector::receive($testRequest);eq($duplicate['id'],$testId);eq($duplicate['duplicate'],true);eq($duplicate['testMode'],true);
$testOrder=wc_get_order($testId);eq($testOrder->get_status(),'on-hold');
eq(($hooks['woocommerce_can_reduce_order_stock'])(true,$testOrder),false);
foreach(['processing','completed','pending','refunded'] as $unsafe){$testOrder->set_status($unsafe);OSP_Print_Connector::hold_test($testOrder);eq($testOrder->get_status(),'on-hold');}
foreach(array_slice(OSP_Print_Connector::STAGES,1) as $index=>$stage){
 $res=OSP_Print_Connector::test_stage(new Request(json_encode(['stage'=>$stage,'revision'=>$index+1]),[],$testId));
 eq($res['stage'],$stage);eq($res['woocommerceStatus'],'on-hold');eq($res['testMode'],true);
}
eq($testOrder->get_meta('_osp_tracking'),'TEST-NOT-A-SHIPMENT');
eq(OSP_Print_Connector::test_stage(new Request(json_encode(['stage'=>'In production','revision'=>1]),[],$testId))->code,'osp_test');
eq(OSP_Print_Connector::test_stage(new Request(json_encode(['stage'=>'In production','revision'=>1]),[],101))->code,'osp_test');
eq(OSP_Print_Connector::test_cancel(new Request('{}',[],101))->code,'osp_test');eq($orders[101]->status,'on-hold');
function is_wp_error($value){return $value instanceof WP_Error;}
function wp_remote_get($url,$args){global $testBytes;
 $parsed=parse_url($url);parse_str($parsed['query'],$q);$path=$parsed['path'].'?'.$parsed['query'];
 eq($parsed['host'],'openshelfpress.com');eq($args['redirection'],0);
 $message=implode("\n",[$args['headers']['X-OSP-Timestamp'],'GET',$path,hash('sha256','')]);
 eq($args['headers']['X-OSP-Signature'],hash_hmac('sha256',$message,OSP_CONNECTOR_SECRET));
 return ['code'=>200,'body'=>$testBytes[$q['kind']]];
}
function wp_remote_retrieve_response_code($r){return $r['code'];} function wp_remote_retrieve_body($r){return $r['body'];}
$verified=OSP_Print_Connector::test_check(new Request('{}',[],$testId));eq($verified['files'],['interior'=>true,'cover'=>true]);
$testBytes['cover'].='tampered';eq(OSP_Print_Connector::test_check(new Request('{}',[],$testId))->code,'osp_test');
$cancelled=OSP_Print_Connector::test_cancel(new Request('{}',[],$testId));eq($cancelled['woocommerceStatus'],'cancelled');eq($cancelled['testMode'],true);
eq(OSP_Print_Connector::test_check(new Request('{}',[],$testId))->code,'osp_test');
$bad=$test;$bad['sourceOrder']='real-order';fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$test;unset($bad['testMode']);fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$test;$bad['delivery']['phone']='9000000000';fails(fn()=>OSP_Print_Connector::validate($bad));
$bad=$test;$bad['items'][0]['isbn']='9780306406157';fails(fn()=>OSP_Print_Connector::validate($bad));
echo "$n WordPress receiver and isolated test-mode checks passed (WordPress/WooCommerce adapters; no live calls)\n";
