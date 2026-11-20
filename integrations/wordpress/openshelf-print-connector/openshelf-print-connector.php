<?php
/**
 * Plugin Name: OpenShelf Print Connector
 * Description: Signed, idempotent OpenShelf production orders held for printer approval.
 * Version: 0.1.0
 * Requires PHP: 8.0
 * Requires Plugins: woocommerce
 */
defined('ABSPATH') || exit;

final class OSP_Print_Connector {
    const PRODUCTS = ['Paperback' => 12982, 'Hardcase' => 14195];
    const CASE_BIND = ['A5' => 22500, 'A4' => 25000];
    const STAGES = ['Awaiting approval', 'In production', 'Ready to ship', 'Dispatched', 'Delivered'];
    public static function boot() {
        add_action('rest_api_init', [__CLASS__, 'routes']);
        add_action('add_meta_boxes', [__CLASS__, 'boxes']);
        add_action('admin_post_osp_stage', [__CLASS__, 'save_stage']);
        add_action('admin_post_osp_file', [__CLASS__, 'download']);
        // OpenShelf owns buyer notifications; these fulfilment records must not send a second bill.
        foreach (['new_order','cancelled_order','failed_order','customer_on_hold_order','customer_processing_order','customer_completed_order','customer_invoice','customer_note','customer_refunded_order'] as $email) {
            add_filter('woocommerce_email_enabled_' . $email, function($enabled, $order) {
                return $order instanceof WC_Order && $order->get_created_via() === 'openshelf' ? false : $enabled;
            }, 10, 2);
        }
        add_filter('woocommerce_order_needs_payment', function($needed, $order) {
            return $order->get_created_via() === 'openshelf' ? false : $needed;
        }, 10, 2);
        add_action('before_woocommerce_init', function() {
            if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
            }
        });
    }
    public static function install() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta('CREATE TABLE ' . $wpdb->prefix . 'osp_print_imports (
            source_order varchar(100) NOT NULL,
            payload_hash char(64) NOT NULL,
            order_id bigint unsigned NULL,
            state varchar(24) NOT NULL,
            created datetime NOT NULL,
            PRIMARY KEY (source_order)
        ) ' . $wpdb->get_charset_collate() . ';');
    }
    private static function secret() { return defined('OSP_CONNECTOR_SECRET') ? (string) OSP_CONNECTOR_SECRET : ''; }
    public static function authorised($request) {
        if (!defined('OSP_CONNECTOR_ENABLED') || OSP_CONNECTOR_ENABLED !== true || strlen(self::secret()) < 32 || !class_exists('WooCommerce')) {
            return new WP_Error('osp_disabled', 'Connector is not activated', ['status' => 503]);
        }
        $timestamp = $request->get_header('x-osp-timestamp');
        $signature = $request->get_header('x-osp-signature');
        if (!preg_match('/^\d{10}$/D', $timestamp) || abs(time() - (int)$timestamp) > 300 || !preg_match('/^[a-f0-9]{64}$/D', $signature)) {
            return new WP_Error('osp_auth', 'Invalid signature', ['status' => 403]);
        }
        $path = wp_unslash($_SERVER['REQUEST_URI'] ?? '');
        $message = implode("\n", [$timestamp, strtoupper($request->get_method()), $path, hash('sha256', $request->get_body())]);
        return hash_equals(hash_hmac('sha256', $message, self::secret()), $signature)
            ? true : new WP_Error('osp_auth', 'Invalid signature', ['status' => 403]);
    }
    public static function routes() {
        register_rest_route('openshelf/v1', '/orders', ['methods' => 'POST', 'permission_callback' => [__CLASS__, 'authorised'], 'callback' => [__CLASS__, 'receive']]);
        register_rest_route('openshelf/v1', '/orders/(?P<id>\d+)', ['methods' => 'GET', 'permission_callback' => [__CLASS__, 'authorised'], 'callback' => [__CLASS__, 'status']]);
    }
    private static function integer($value, $min, $max) { return is_int($value) && $value >= $min && $value <= $max; }
    public static function validate($p) {
        if (!is_array($p) || ($p['schema'] ?? null) !== 1 || ($p['mode'] ?? '') !== 'hold' || ($p['currency'] ?? '') !== 'INR' || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $p['sourceOrder'] ?? '')) throw new Exception('Invalid order envelope');
        if (!is_array($p['items'] ?? null) || count($p['items']) < 1 || count($p['items']) > 50) throw new Exception('Invalid order items');
        $d = $p['delivery'] ?? [];
        foreach (['name','address','city','state','pin','phone'] as $k) if (!is_string($d[$k] ?? null) || trim($d[$k]) === '' || strlen($d[$k]) > 1000) throw new Exception('Incomplete delivery address');
        if (($d['country'] ?? '') !== 'IN' || !preg_match('/^[1-9]\d{5}$/D', $d['pin']) || !preg_match('/^[0-9 +()-]{10,16}$/D', $d['phone'])) throw new Exception('Invalid delivery PIN or phone');
        foreach ($p['items'] as $index => $i) {
            $binding = $i['binding'] ?? 'Paperback';
            if (!isset(self::PRODUCTS[$binding]) || ($i['productId'] ?? 0) !== self::PRODUCTS[$binding] || ($i['index'] ?? -1) !== $index || !self::integer($i['copies'] ?? null, 1, 10000) || !is_string($i['title'] ?? null) || strlen($i['title']) > 300 || !preg_match('/^97[89]\d{10}$/D', $i['isbn'] ?? '')) throw new Exception('Invalid book item');
            $c = $i['config'] ?? [];
            if (($c['approved'] ?? false) !== true || !in_array($c['size'] ?? '', ['A5','A4','B5','6x9','B6'], true) || !in_array($c['lamination'] ?? '', ['Matte','Gloss'], true) || !is_string($c['paper'] ?? null) || strlen($c['paper']) > 120 || !self::integer($c['gsm'] ?? null, 50, 400)) throw new Exception('Invalid approved print specification');
            if (!self::integer($c['blackPages'] ?? null, 0, 2000) || !self::integer($c['colourPages'] ?? null, 0, 2000) || $c['blackPages'] + $c['colourPages'] < 24 || $c['blackPages'] + $c['colourPages'] > 2000 || !is_numeric($c['unitWeightGrams'] ?? null) || $c['unitWeightGrams'] <= 0 || $c['unitWeightGrams'] > 10000) throw new Exception('Invalid pages or weight');
            if ($binding === 'Hardcase' && !isset(self::CASE_BIND[$c['size']])) throw new Exception('No approved hardcase rate for this size');
            $cost = self::cost($c, $i['copies'], $binding);
            if (($i['cost']['unitPaise'] ?? null) !== $cost || ($i['cost']['totalPaise'] ?? null) !== $cost * $i['copies']) throw new Exception('Production cost does not match approved rates');
            foreach (['interior','cover'] as $kind) if (!self::integer($i['files'][$kind]['version'] ?? null, 1, PHP_INT_MAX) || !is_string($i['files'][$kind]['filename'] ?? null)) throw new Exception('Missing approved PDF version');
        }
    }
    public static function cost($c, $copies, $binding = 'Paperback') {
        $rates = ['A5'=>[35,42,40], 'A4'=>[70,76,75], 'B5'=>[45,52,50], '6x9'=>[45,52,50], 'B6'=>[25,32,30]];
        $pages = $c['blackPages'] + $c['colourPages'];
        $band = $pages <= 500 ? 0 : ($pages <= 1000 ? 1 : 2);
        $small = in_array($c['size'], ['A5','B6'], true);
        $bind = $binding === 'Hardcase' ? self::CASE_BIND[$c['size']] : ($small ? ([4000,2800,3400,2800,3000][$copies-1] ?? 2500) : ($copies < 10 ? 4200 : ($copies < 100 ? 4000 : 3400)));
        return $c['blackPages']*$rates[$c['size']][$band] + $c['colourPages']*($small ? 500 : 1000) + $bind;
    }
    public static function receive($request) {
        global $wpdb;
        try { if (strlen($request->get_body()) > 200000) throw new Exception('Payload too large'); $p=$request->get_json_params(); self::validate($p); self::state_code($p['delivery']['state']); }
        catch (Throwable $e) { return new WP_Error('osp_invalid', $e->getMessage(), ['status'=>400]); }
        $source=$p['sourceOrder']; $hash=hash('sha256', $request->get_body());
        $lock='osp_' . substr(hash('sha256', $source), 0, 50);
        if ((int)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 5)', $lock)) !== 1) return new WP_Error('osp_busy','Transfer busy; retry later',['status'=>503]);
        $table=$wpdb->prefix.'osp_print_imports';
        try {
            $prior=$wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE source_order=%s", $source));
            if ($prior) {
                if (!hash_equals($prior->payload_hash, $hash)) return new WP_Error('osp_conflict','The same source reference has different files or specifications',['status'=>409]);
                if ($prior->state !== 'ready' || !$prior->order_id || !wc_get_order($prior->order_id)) return new WP_Error('osp_review','A previous import requires manual reconciliation; do not recreate it',['status'=>409]);
                return ['id'=>(int)$prior->order_id,'sourceOrder'=>$source,'payloadHash'=>$hash,'duplicate'=>true];
            }
            $products=[];
            foreach ($p['items'] as $i) {
                $pid=self::PRODUCTS[$i['binding'] ?? 'Paperback'];
                $products[$pid]=$products[$pid] ?? wc_get_product($pid);
                if (!$products[$pid] || $products[$pid]->get_status() !== 'publish') throw new Exception('Print product '.$pid.' is unavailable');
            }
            // Reserve before creating. A crash leaves a visible reconciliation block, never another order.
            if (!$wpdb->insert($table,['source_order'=>$source,'payload_hash'=>$hash,'state'=>'creating','created'=>current_time('mysql',true)])) throw new Exception('Unable to reserve source reference');
            $order=new WC_Order();
            $order->set_created_via('openshelf'); $order->set_currency('INR'); $order->set_status('on-hold');
            $order->set_payment_method('osp_internal_settlement'); $order->set_payment_method_title('OpenShelf internal settlement — pending printer review');
            $order->update_meta_data('_osp_source_order',$source); $order->update_meta_data('_osp_payload_hash',$hash);
            $order->update_meta_data('_osp_payload',$p); $order->update_meta_data('_osp_stage','Awaiting approval'); $order->update_meta_data('_osp_revision',1);
            $names=preg_split('/\s+/',trim($p['delivery']['name']),2);
            $address=['first_name'=>$names[0],'last_name'=>$names[1]??'','address_1'=>$p['delivery']['address'],'city'=>$p['delivery']['city'],'state'=>self::state_code($p['delivery']['state']),'postcode'=>$p['delivery']['pin'],'country'=>'IN','phone'=>$p['delivery']['phone']];
            $order->set_address($address,'shipping');
            // No retail billing identity or buyer email: this is a production/dispatch record.
            $order->save();
            $wpdb->update($table,['order_id'=>$order->get_id()],['source_order'=>$source]);
            $grams=0;
            foreach ($p['items'] as $i) {
                $c=$i['config']; $item=new WC_Order_Item_Product(); $item->set_product($products[self::PRODUCTS[$i['binding'] ?? 'Paperback']]); $item->set_name($i['title']); $item->set_quantity($i['copies']);
                $total=$i['cost']['totalPaise']/100;
                $item->set_subtotal($total); $item->set_total($total); $item->set_taxes(['total'=>[],'subtotal'=>[]]);
                $meta=['Print Size'=>$c['size'],'Trim Size'=>$i['trimSize']??'','Paper'=>$c['paper'].' '.$c['gsm'].' GSM','Binding'=>(($i['binding'] ?? 'Paperback')==='Hardcase' ? 'Case Binding (Hardcase)' : 'Perfect Binding'),'B&W Inner Pages'=>(string)$c['blackPages'],'Color Inner Pages'=>(string)$c['colourPages'],'No. of Pages'=>(string)($c['blackPages']+$c['colourPages']),'Copies'=>(string)$i['copies'],'Lamination'=>$c['lamination'],'ISBN'=>$i['isbn'],'Shipping'=>'Shipping — printer books dispatch','Upload Status'=>'received','OpenShelf Reference'=>$source,'Production Pricing'=>'Estimate excludes shipping and taxes; staff must review'];
                foreach (['interior'=>'Content File','cover'=>'Cover File'] as $kind=>$label) $meta[$label]=add_query_arg(['action'=>'osp_file','order'=>$order->get_id(),'item'=>$i['index'],'kind'=>$kind],admin_url('admin-post.php'));
                foreach ($meta as $k=>$v) $item->add_meta_data($k,$v,true);
                $weight=$c['unitWeightGrams']*$i['copies']; $grams+=$weight;
                $item->add_meta_data('_wcpc_weight_grams',$weight,true); $item->add_meta_data('_item_weight',$weight/1000,true); $item->add_meta_data('_wcpc_upload_pending','',true);
                $order->add_item($item);
            }
            $order->update_meta_data('wf_order_weight',$grams/1000); $order->update_meta_data('_order_weight',$grams/1000);
            $order->calculate_totals(false); $order->save();
            // Compatibility with the observed Shiprocket legacy weight reader; never alter shared product weight.
            update_post_meta($order->get_id(),'wf_order_weight',$grams/1000); update_post_meta($order->get_id(),'_order_weight',$grams/1000);
            $order->add_order_note('Imported from OpenShelf. Customer paid OpenShelf; production settlement is separate. Check approved PDFs, production estimate, tax treatment, package weight and shipping before release.');
            if ($wpdb->update($table,['state'=>'ready'],['source_order'=>$source]) === false) throw new Exception('Unable to finalise import');
            return ['id'=>$order->get_id(),'sourceOrder'=>$source,'payloadHash'=>$hash];
        } catch (Throwable $e) { return new WP_Error('osp_review','Import requires printer review; inspect the source reference before retrying',['status'=>409]); }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock)); }
    }
    private static function state_code($state) {
        $states=WC()->countries->get_states('IN');
        foreach ($states as $code=>$name) if (strcasecmp($code,$state)===0 || strcasecmp($name,$state)===0) return $code;
        throw new Exception('Use an Indian state name or code');
    }
    public static function status($request) {
        $order=wc_get_order((int)$request['id']);
        if (!$order || $order->get_created_via() !== 'openshelf') return new WP_Error('osp_missing','Order not found',['status'=>404]);
        return ['id'=>$order->get_id(),'sourceOrder'=>$order->get_meta('_osp_source_order'),'stage'=>$order->get_meta('_osp_stage'),'revision'=>(int)$order->get_meta('_osp_revision'),'carrier'=>$order->get_meta('_osp_carrier'),'tracking'=>$order->get_meta('_osp_tracking'),'trackingURL'=>$order->get_meta('_osp_tracking_url')];
    }
    public static function boxes() {
        foreach (['shop_order','woocommerce_page_wc-orders'] as $screen) add_meta_box('osp-production','OpenShelf production',[__CLASS__,'box'],$screen,'normal','high');
    }
    public static function box($object) {
        $order=$object instanceof WC_Order ? $object : wc_get_order($object->ID);
        if (!$order || $order->get_created_via() !== 'openshelf') { echo '<p>Not an OpenShelf fulfilment order.</p>'; return; }
        $stage=$order->get_meta('_osp_stage'); $next=array_search($stage,self::STAGES,true)+1;
        echo '<p><strong>'.esc_html($order->get_meta('_osp_source_order')).'</strong> · '.esc_html($stage).'</p><p>Customer payment stays in OpenShelf. These totals are estimated production charges, excluding shipping and tax. Approve the charge/settlement and exact PDFs before printing.</p>';
        if ($next >= count(self::STAGES)) return;
        // Buttons belong to the existing order editor form; submit to a separate nonce-checked action.
        wp_nonce_field('osp_stage_'.$order->get_id(),'osp_nonce');
        echo '<input type="hidden" name="osp_order" value="'.esc_attr($order->get_id()).'"><input type="hidden" name="osp_revision" value="'.esc_attr($order->get_meta('_osp_revision')).'">';
        echo '<p><label>Carrier <input name="osp_carrier" value="'.esc_attr($order->get_meta('_osp_carrier')).'"></label> <label>Tracking <input name="osp_tracking" value="'.esc_attr($order->get_meta('_osp_tracking')).'"></label></p><p><label>Tracking URL <input type="url" name="osp_tracking_url" value="'.esc_attr($order->get_meta('_osp_tracking_url')).'"></label></p>';
        echo '<p><label><input type="checkbox" name="osp_confirmed" value="1"> I checked '.($next===1?'the approved files, production charges, tax, settlement and dispatch responsibility':'the evidence for this production/dispatch stage').'.</label></p>';
        $action=add_query_arg('action','osp_stage',admin_url('admin-post.php'));
        echo '<button type="submit" class="button button-primary" formaction="'.esc_url($action).'" formmethod="post" name="osp_next" value="'.esc_attr(self::STAGES[$next]).'">Confirm '.esc_html(self::STAGES[$next]).'</button>';
    }
    public static function save_stage() {
        if (!current_user_can('manage_woocommerce')) wp_die('Not authorised',403);
        $id=absint($_POST['osp_order']??0); check_admin_referer('osp_stage_'.$id,'osp_nonce');
        $order=wc_get_order($id); if (!$order || $order->get_created_via()!=='openshelf') wp_die('Order not found');
        global $wpdb; $lock='osp_stage_'.$id;
        if ((int)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,5)',$lock))!==1) wp_die('Stage is busy; refresh');
        try {
            $order=wc_get_order($id); $revision=(int)$order->get_meta('_osp_revision');
            $index=array_search($order->get_meta('_osp_stage'),self::STAGES,true);
            $target=sanitize_text_field(wp_unslash($_POST['osp_next']??''));
            if ((int)($_POST['osp_revision']??0)!==$revision || $index===false || (self::STAGES[$index+1]??'')!==$target || empty($_POST['osp_confirmed'])) wp_die('Refresh the order and confirm the next stage');
            $carrier=sanitize_text_field(wp_unslash($_POST['osp_carrier']??'')); $tracking=sanitize_text_field(wp_unslash($_POST['osp_tracking']??''));
            if (in_array($target,['Dispatched','Delivered'],true)&&(!$carrier||!$tracking)) wp_die('Carrier and tracking are required');
            $order->update_meta_data('_osp_stage',$target); $order->update_meta_data('_osp_revision',$revision+1); $order->update_meta_data('_osp_carrier',$carrier); $order->update_meta_data('_osp_tracking',$tracking);
            $url=esc_url_raw(wp_unslash($_POST['osp_tracking_url']??''),['https']); $order->update_meta_data('_osp_tracking_url',$url);
            if ($target==='In production') $order->set_status('processing');
            if ($target==='Delivered') $order->set_status('completed');
            $order->save(); $order->add_order_note('OpenShelf production: '.$target.'; confirmed by user '.get_current_user_id());
            // No payment_complete: production settlement remains a separate accounting decision.
        } finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock)); }
        wp_safe_redirect($order->get_edit_order_url()); exit;
    }
    public static function download() {
        if (!current_user_can('manage_woocommerce')) wp_die('Not authorised',403);
        $order=wc_get_order(absint($_GET['order']??0));
        $index=filter_var($_GET['item']??null,FILTER_VALIDATE_INT);
        $kind=sanitize_key($_GET['kind']??'');
        if (!$order || $order->get_created_via()!=='openshelf' || $index===false || $index<0 || !in_array($kind,['interior','cover'],true) || !isset($order->get_meta('_osp_payload')['items'][$index])) wp_die('File not found');
        if (strlen(self::secret())<32 || !defined('OSP_CONNECTOR_ENABLED') || OSP_CONNECTOR_ENABLED!==true) wp_die('Connector disabled');
        $query=http_build_query(['order'=>$order->get_meta('_osp_source_order'),'item'=>$index,'kind'=>$kind],'','&',PHP_QUERY_RFC3986);
        $path='/api/printing/files?'.$query; $timestamp=(string)time();
        $message=implode("\n",[$timestamp,'GET',$path,hash('sha256','')]);
        $response=wp_remote_get('https://openshelfpress.com'.$path,['timeout'=>30,'redirection'=>0,'limit_response_size'=>16*1024*1024,'headers'=>['X-OSP-Timestamp'=>$timestamp,'X-OSP-Signature'=>hash_hmac('sha256',$message,self::secret())]]);
        if (is_wp_error($response)||wp_remote_retrieve_response_code($response)!==200) wp_die('Unable to retrieve the approved PDF. Check the OpenShelf connection.');
        $body=wp_remote_retrieve_body($response); if (substr($body,0,5)!=='%PDF-') wp_die('The approved file is not a PDF');
        $p=$order->get_meta('_osp_payload'); $filename=sanitize_file_name($p['items'][$index]['files'][$kind]['filename']);
        nocache_headers(); header('Content-Type: application/pdf'); header('X-Content-Type-Options: nosniff'); header('Content-Disposition: attachment; filename="'.$filename.'"'); echo $body; exit;
    }
}
register_activation_hook(__FILE__, ['OSP_Print_Connector','install']);
OSP_Print_Connector::boot();
