# Daily printer settlement: launch and operating guide

## What this release provides

One supplier remittance per closed IST day, covering an immutable list of independent WooCommerce orders. Each customer keeps a separate delivery, print snapshot and tracking record. Customer collection, printer liability, bank settlement, customer refunds and author royalties remain separate records. Bank payouts and refunds default to disabled. No actual provider transaction is proved by the repository checks.

Code is prepared; this document does not certify production setup. KYC is one external dependency, alongside the fixed-IP relay, credentials/webhooks, beneficiary/funding, business terms and acceptance tests.

## Safe installation sequence

1. Review and merge the release into the existing `main` deployment. Keep `PAYOUTS_ENABLED=0`, `REFUNDS_ENABLED=0` and `SETTLEMENT_SCHEMA=0` while installing. Do not enable automatic payment policy yet. Back up D1 and WordPress first, retaining a restore point.
2. After the existing Cloudflare build, apply **only** the new migration to the existing database using the existing authenticated deployment environment:

   ```sh
   pnpm exec wrangler d1 execute openself-press-db --remote --config dist/server/wrangler.json --file drizzle/0004_printer_settlements.sql
   ```

   Inspect results before continuing. Do not reapply this SQL blindly; it creates tables and is not an idempotent repair script. Existing migrations 0000–0003 must already be installed. No existing order/catalogue data should be replaced. Enable `SETTLEMENT_SCHEMA=1` only after all eight new tables exist.
3. Upgrade the existing WordPress connector with `integrations/wordpress/openshelf-print-connector.zip`, version **0.3.0**. Preserve its existing shared secret and import registry. This is custom live-store code: back up, review, and install through the authorised hosting/plugin workflow. Check `/admin/accounts` → **Check provider setup** reports capabilities version 3.
4. Keep the existing WordPress constants `OSP_CONNECTOR_ENABLED=true` and secret `OSP_CONNECTOR_SECRET`. For daily credit terms, the printer owner must agree to accepting production before daily remittance, then add:

   ```php
   define('OSP_ALLOW_DAILY_SETTLEMENT', true);
   ```

   Place it before the stop-editing line in `wp-config.php`; do not share that file. Without agreed daily credit terms, the panel waits for confirmed supplier settlement before production. Neither option marks the customer's Woo order paid.
5. Deploy the [provider relay](../integrations/provider-relay/README.md). Use the same PG key pair in the Worker and relay, a distinct relay secret, correct mode, verified beneficiary, funded source account and confirmed outbound IP allowlisting. Keep `FINANCE_MODE=test` throughout test acceptance. A test payment is blocked from transfer to the production printer.
6. In the payment provider, configure `https://openshelfpress.com/api/webhooks/razorpay` for captured payments and refund events with `RAZORPAY_WEBHOOK_SECRET`. Configure a separate payout webhook `https://openshelfpress.com/api/webhooks/razorpayx` for payout lifecycle events, including processing/processed/failed/rejected/cancelled/reversed, with its own `RAZORPAYX_WEBHOOK_SECRET`. Select events supported by your account. The handlers verify the raw request signature and event ID, then fetch the canonical provider record.
7. Verify the Worker five-minute scheduled trigger invokes both queues. Fill legal seller details and approved privacy, sale, shipping and return policies in Settings. Confirm supplier invoice/tax treatment, payout costs, cancellation, reprint/RTO and royalty responsibilities. Save the supplier terms and ceiling in Accounts, initially with automatic submission off.
8. Run acceptance in an isolated staging store/database with test credentials. Do not import synthetic test-key orders into the live printer; the finance-enabled production connector refuses that transfer. For the production printer's connection check, use authenticated capabilities and the existing unpaid preview order, not a fake captured payment.
9. After test acceptance and provider activation, review the actual live account/key, beneficiary, limits, funding, tax/shipping and print files. Change to matching live keys/mode on both services. A new environment gets separate daily batches (`ps-live-YYYY-MM-DD` versus `ps-test-YYYY-MM-DD`); test invoices never become live liabilities. Previously captured records without an environment need **Verify captured payment** before settlement approval.
10. The owner enables `PRINTING_ENABLED=1`, then separately `PAYOUTS_ENABLED=1` and, if needed, `REFUNDS_ENABLED=1` after reviewing those effects. Use manual approval for initial daily batches. Automatic daily submission is a further explicit policy choice, within the configured ceiling. A scheduled batch does not itself make a bank transfer while payouts are disabled.

## Everyday flow

- Captured customer payment → immutable print job → independent on-hold printer order with delivery details and approved PDFs.
- Printer confirms invoice/reference and final production/shipping/tax/discount amounts. OpenShelf syncs and approves that exact revision. Estimates never become payable automatically.
- At 00:15 IST, eligible invoices approved before midnight enter one daily batch. Later approvals carry forward. Empty batches make no transfers. Older unbatched approved invoices are included in the next eligible batch.
- Review the itemised CSV and beneficiary, approve and submit. Queued/pending/processing is unpaid. Provider `processed` changes the ledger to Settled. Fees, UTR and acknowledgement are visible. Failed acknowledgement retries without a second payout; large manifests are acknowledged in chunks of 20 orders.
- A reversal reopens the same liability and updates the printer receipt. Reconcile terminal failure/reversal before a replacement attempt. No new payout is created simply because a request timed out.

## Exception handling

| Situation | Action |
| --- | --- |
| Unknown checkout result | Keep the durable intent. Find its provider order by reference and use **Verify and link existing checkout**. Do not create another checkout. |
| Capture after unpaid cancellation or an extra capture | Payment recovery case holds fulfilment. Review the canonical payment, approve the recovery refund case, then submit/reconcile it. Customer is told not to pay again. |
| Invoice revised after batching | Hold payment. If no bank attempt ever existed, withdraw the unsent batch with a reason, resync/review charges, and carry them to a later daily batch. Preserve the withdrawn manifest. Otherwise reconcile with the supplier/provider. |
| Customer cancellation | Request printer cancellation before release. Wait for confirmation. Record an agreed zero-charge void or explicitly confirm any supplier liability; a refund does not stop a physical job. |
| Customer refund | Review amount (partial permitted within the request), approve, then submit against original capture. Pending/uncertain refunds reserve the captured balance. A failed gateway refund needs reconciliation before external bank fallback. |
| External bank refund | Upload bank evidence to the refund case, confirm completed transfer/reference, then record it. It reserves the same balance and cannot coexist with a pending/processed gateway refund for that case. No bank transfer is performed by this recording action. |
| Supplier credit after payment | Upload evidence, record supplier credit reference and amount. Allocate the whole note once to a future payable batch; oversized notes carry forward. Never erase the settled invoice. |
| Funds unavailable | Fund the correct source account through its owner. A provider queue is visible but is not payment. Never pay the supplier a second time outside the ledger without reconciliation. |
| Damaged/RTO/lost parcel or reprint | Open a linked support/refund case, agree customer and supplier cost responsibility, and review before any new shipment or financial entry. This release does not autonomously adjudicate such claims. |
| Refund created in the provider dashboard | Its signed webhook fetches the canonical refund, records it once against the captured payment, and holds supplier liability for review. If no webhook arrived, reconcile provider and bank evidence before another refund. |

## Acceptance evidence to retain

Run repository finance, printing, workflow and relay tests; type-check and production build. Run PHP receiver checks with PHP 8.3 (`php tests/printing-wordpress.php`) or the same PHP-WASM adapter used during development. The provider tests mock every external request.

Then retain staging evidence for test capture/late capture, two customer deliveries with separate PDFs, final supplier revisions, one remittance covering both orders, unknown response/resume using the same key, processed and reversed reconciliation, partial/duplicate refund protection, credit carry-forward and printer acknowledgement retry. Finally verify the live settings without making an unauthorised real payment. Keep payment and payout switches off until these external gates are completed.
