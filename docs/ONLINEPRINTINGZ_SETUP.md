# OpenShelf → OnlinePrintingz connector

This branch prepares the connection. It does not activate either production website.

## Implemented behaviour

- Reader checkout and accepted author-copy orders capture the exact approved interior/cover R2 object keys and file revisions in a private snapshot table when `PRINTING_ENABLED=1`.
- Only approved perfect-bound paperback editions are supported in this first release. Staff approve the priced size, paper/GSM, B&W/colour page split, lamination and per-copy weight in the edition record. There is no inferred A4 rate for a custom trim.
- Verified Razorpay capture and verified external receipts atomically mark the order Paid and create an outbox job. An unpaid order cannot reach the printer. Existing older orders require explicit staff confirmation against their current approved files; those are not presented as historical checkout snapshots.
- A five-minute Worker scheduled handler transfers due jobs, retries temporary failures, synchronises production/tracking and dispatches its own notification outbox through the existing email provider when configured. Check the deployed Worker actually has the cron trigger; this repository's Vite config declares it.
- The WordPress receiver creates one on-hold fulfilment order against perfect-binding product **12982**, with the observed WCPC metadata labels and total weight fields. It does not call `payment_complete`, capture a second customer payment or book a courier.
- WordPress production staff explicitly confirm each stage: Awaiting approval → In production → Ready to ship → Dispatched → Delivered. Dispatch and delivery require carrier/tracking. WooCommerce status changes to processing on release and completed on delivered; unrelated direct Woo status changes are not treated as authoritative production evidence. Use the **OpenShelf production** panel.
- Printing progress and tracking update the existing OpenShelf order. Existing customer purchase/author-copy screens see the normal order statuses, and record pages show the printer stage. In-app notifications are idempotent; customer emails use the existing provider and retry queue. WooCommerce order emails and pay-order links are suppressed for connector-created orders.
- Source-side carrier creation and manual fulfilment actions are blocked once the printer order is linked, to prevent duplicate dispatches.
- Staff can see the latest 100 transfer jobs on Orders/Production/Shipping and open a specific order for its status/error/retry controls.

## Production charges and royalties

Retail revenue remains in OpenShelf. WooCommerce item totals are **estimated production charges**, in INR, using the supplied printing/perfect-binding rates. They include the supplied wrapper/lamination/binding allowance and exclude shipping/taxes. They are not proof of payment, a final supplier invoice or a tax computation.

Page-price bands use pages **per book**, and quantity selects binding charge per copy. The unusual A5/B6 binding sequence (₹40, ₹28, ₹34, ₹28, ₹30, then ₹25) is preserved. Existing royalty, payout, refund and reconciliation workflows remain in place; no author share, settlement agreement, tax treatment or new selling price is invented. Before releasing a real order, confirm how OpenShelf pays OnlinePrintingz and who books/pays shipping. No money moves through this connector.

## Credential and file boundary

The server destinations are pinned to `https://onlineprintingz.in` and `https://openshelfpress.com`. A shared random secret signs timestamp, HTTP method, exact path/query and SHA-256 body digest. The allowed clock skew is five minutes. Imports use a unique source-order registry and a MySQL named lock.

No full WooCommerce read/write API credential is needed. The connector secret grants access only to the added order-import/status endpoints and the approved order-file endpoint. Do not put it in GitHub, browser JavaScript, a URL, a chat message or logs. Store it in the OpenShelf runtime and WordPress `wp-config.php` through secure hosting controls.

Private R2 object keys never leave OpenShelf. The printer's Content File / Cover File links require a signed-in WordPress user with `manage_woocommerce`. WordPress fetches the exact snapshot bytes from OpenShelf with signed server headers. The files are not copied into public WordPress media. Original snapshot objects must be retained; never delete an old R2 object still referenced by an order.

## Activation order

1. Review and merge the branch into the actual OpenShelf deployment source. Confirm the hosting pipeline for **openshelfpress.com**: this repository contains no project/account identifier, and the similarly named private ChatGPT Site has no custom domains attached. Do not deploy that other Site as a substitute.
2. Back up the production database and WordPress files/database using the existing backup tooling.
3. Apply `drizzle/0003_printing_connector.sql` to the actual production D1 binding, after the existing migrations. The schema/journal/snapshot are included. Keep `PRINTING_ENABLED=0`.
4. Deploy the OpenShelf source with the connector still disabled. Verify existing author login, bookstore and payments. Confirm the cron trigger is registered and callback/file routes are not behind a hosting sign-in wall. Do not weaken the site's authentication to make a test pass.
5. Install `integrations/wordpress/openshelf-print-connector.zip` through Plugins → Add Plugin → Upload Plugin, then activate. This executes custom code and creates a small import-registry table; obtain approval before this live-store action. Without the constants below the REST endpoints return 503 and cannot import orders.
6. Generate one random secret of at least 32 characters using a password manager or secure hosting secret generator. Add it to the OpenShelf runtime as `PRINTING_SECRET`, and through secure WordPress hosting controls add:

   ```php
   define('OSP_CONNECTOR_SECRET', 'YOUR_RANDOM_SECRET_ENTERED_SECURELY');
   define('OSP_CONNECTOR_ENABLED', true);
   ```

   Configuring this credential creates persistent server access and requires approval. Do not paste its real value into this guide. Do not change existing credentials or settings.
7. In the OpenShelf staff record for Dynamic GK, verify final ISBN/proof/PDF approvals, actual trim, page count, paper/GSM, lamination and measured unit weight. Approve the printing configuration. The API and UI refuse missing/unsupported inputs. Complete the existing publication/catalogue flow if the book is not published yet; the connector does not allocate ISBNs or silently publish unapproved books.
8. Turn on `PRINTING_ENABLED=1` only after reviewing the settlement/dispatch decisions and scheduling the controlled test. The runtime must redeploy or refresh according to its host's environment-variable procedure.
9. Run one explicitly identified test order with synthetic delivery/contact data. Use a configured Razorpay **test** environment or an explicit test-only external receipt; never create a false paid receipt on a real customer order. Avoid live payment capture or courier purchase. Check the actual protected PDFs, WCPC print details, quantity, estimated production total, weight and source reference. Imported order must stay **on hold / Awaiting approval**.
10. Retry the same transfer: confirm the same Woo order ID and no second order. Change one file record after creating the test order: confirm the transferred order still downloads the original snapshot PDF.
11. In the WordPress OpenShelf production panel, advance the synthetic test through stages and verify sync back to OpenShelf. Check a missing tracking field is refused. No automatic courier booking occurs. Check real Shiprocket reads the order's shipping contact/weight before any live dispatch; its integration may require a billing profile and manual package dimensions. Configure those as printer business settings, not invented customer tax information.
12. Verify actual notification delivery, then approve the first real production order manually. Keep approval mode for initial use. There is no unattended print release in this version.

## Failure/recovery rules

- Temporary HTTP/network failures use exponential retry up to eight attempts; then staff review. HTTP 400/401/403/404/409/422 moves directly to Review. An active one-minute local lease prevents concurrent sends. Reuse the original source reference and payload when retrying.
- If WordPress crashes during import it leaves a `creating` registry entry and refuses to create another order. Inspect `wp_osp_print_imports` (with your actual prefix), `_osp_source_order` metadata and the Woo order. Reconcile the existing import; do not delete the registry row and blindly retry. Complete a partially created order under controlled staff review or roll back the partial order/registry together only after confirming no production was released.
- An order with an existing OpenShelf carrier shipment or an unresolved refund/return is blocked from transfer pending reconciliation. Returns/refunds after transfer require direct printer coordination; there is no automatic paid-order cancellation endpoint.
- Remote IDs and source references are validated. Old printer revisions cannot rewind an order. A conflicting source payload is held for manual review.
- Disabling `PRINTING_ENABLED` stops source transfer, sync, file retrieval and printing emails. Disabling `OSP_CONNECTOR_ENABLED` stops imports and protected file downloads at WordPress. Neither action deletes orders or stops a physical job already released. Coordinate with the print team.
- Keep both migration tables during rollback so historical orders retain exact file references. Turning the connector off is the first rollback step; do not remove an active order or financial record.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node tests/printing.mjs
php tests/printing-wordpress.php
node tests/complete-workflows.mjs
node tests/author-tools.mjs
node tests/workflows.mjs
pnpm run build
```

The TypeScript tests execute real compiled handlers against isolated SQLite/R2 adapters and mocked external HTTP. The PHP tests execute the actual receiver with WordPress/WooCommerce test adapters, including an import crash and duplicate replay. These checks do not replace the live WordPress/Shiprocket/hosting acceptance test above. No live credentials, customer orders, emails, courier purchases or payments are used by the test suites.
