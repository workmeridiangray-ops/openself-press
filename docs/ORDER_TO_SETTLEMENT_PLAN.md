# OpenShelf → OnlinePrintingz: order, money and settlement specification

## Objective and boundary

Customers pay OpenShelf the complete retail checkout amount. Each customer delivery remains an independent printing order, containing its own address, phone, edition, exact approved PDFs, copies, production progress and tracking. OnlinePrintingz is a supplier paid from OpenShelf's separate account. One daily supplier payout covers the itemised eligible orders, never combines their deliveries.

The existing connector handles fulfilment, not supplier payments. This work adds supplier charge confirmation, reconciliation, a daily batch ledger, controlled payouts and customer refunds. No real transfers are authorised by development/testing. Defaults remain disabled until production readiness is demonstrated. PR #10's optional synthetic test-mode feature is not part of this implementation.

## Default operating policy

- Currency INR; all persisted arithmetic in integer paise.
- Calendar and batch cutoff: Asia/Kolkata. At 00:15 IST the system prepares the previous day's batch, including older approved unpaid charges. One batch per supplier/day/environment (`ps-test-YYYY-MM-DD` or `ps-live-YYYY-MM-DD`). A five-minute queue handles retries and reconciliation.
- Only captured customer payments or separately evidenced, admin-verified external receipts allow production. Unpaid/COD orders are not represented as paid.
- Print jobs arrive on hold. Printer staff accept/release individual jobs and remain responsible for courier booking, package dimensions, accurate measured weight and carrier tracking. Customer email/royalty flows remain OpenShelf's responsibility.
- Printer confirms a supplier invoice/reference and final printing, shipping, tax and any discount amounts. The initial ₹71.40 example is a production estimate, not a supplier invoice or an amount proved paid.
- OpenShelf approves the exact charge revision before it becomes payable. A changed quote invalidates approval. No guessed tax rate, invented GST status, fabricated shipping charge or unsupported automatic trim substitution.
- Initial payout policy requires admin approval of each frozen daily batch. Scheduled automatic approval is available only under a saved explicit amount ceiling and verified activation configuration. Preparing a batch never moves money.
- Cutoff means accepted, charge-confirmed, approved and unbatched by the cutoff. Unready orders carry forward. Empty or sub-minimum batches do not trigger payments.
- A payout account needs available funds plus provider fees/tax; receiving a customer payment does not immediately fund a RazorpayX account. No promise of same-day settlement of customer receipts.

## Customer money and margin

Keep separate measures for retail collected, customer shipping collected, customer refunds, production invoice, supplier shipping/tax, gateway charges, payout fees/tax, author royalty liability and contribution margin. A residual is not labelled net profit while any cost is unknown. Do not change the existing author royalty agreement or derive author shares from the supplier margin.

Customer invoices remain distinct from supplier invoices and daily remittance statements. Document numbers, legal seller names/addresses, GST configuration and refund terms come from approved business settings. Tax is not calculated from an assumed universal GST percentage. Missing legal/tax settings are readiness blockers.

## Independent state machines

| Object | States and evidence |
| --- | --- |
| Customer payment | Awaiting payment → captured/verified → partially/full refunded; payment ID and original amount verified server-side |
| Printer job | Queued → transferred/on hold → in production → ready → dispatched → delivered; same immutable source reference and approved file versions |
| Supplier charge | Awaiting review → approved → batched → settled; revised/held/disputed where costs or refunds change |
| Daily batch | Draft → approved → sending → queued/pending/processing → processed; failed/cancelled/reversed/uncertain need explicit resolution |
| Customer refund | Requested → reviewed → provider submission → processed/failed/uncertain; separate from supplier credit |
| Supplier credit | Issued/reviewed → approved → allocated to future remittance; audit trail never deletes a settled invoice |

Provider `processed` is the evidence of a completed supplier transfer. Request submission, queue acceptance, an HTTP 200, a WooCommerce order status, or a manually typed UTR is not sufficient proof of settlement. A later reversal reopens the liability and is visible, even after an earlier processed event.

## Batch and duplicate-payment rules

Freeze a manifest of OpenShelf order ID, WooCommerce order ID, confirmed invoice/revision, each cost component, credits and total. Every charge can be allocated once. Approvals are bound to this manifest and beneficiary configuration. Refund/dispute holds and configuration changes are rechecked immediately before submission.

Persist the payout attempt, immutable request body and random UUID idempotency key BEFORE the bank request. Concurrent cron/manual runs use a database lease and compare-and-swap. Timeout/5xx means uncertain, not failed; retry only the identical request with its original key, or reconcile its existing payout ID. Never create another batch to recover an uncertain transfer. A new attempt is permitted only after provider-confirmed terminal failure/reversal and explicit approval.

Use signed raw-body webhooks with event deduplication. Fetch and validate the provider entity against expected beneficiary, currency, amount, reference and environment before changing the ledger. Stale/out-of-order events cannot rewind settled/reversed state. Record bank reference, provider fee/tax, timestamps and manifest checksum. Send idempotent remittance acknowledgements to the printer in chunks of 20 orders, retaining the full-manifest and chunk checksums and cursor. Acknowledgement failure must not repeat the bank payment.

## Refunds, cancellations and changes

- Cancel unpaid orders and restore reserved inventory through the existing flow.
- Before printer release, request cancellation and obtain printer confirmation before treating production as stopped. After release, use a manual resolution state; a customer refund does not undo physical work.
- Hold unsubmitted supplier charges for unresolved refunds/disputes. If money was already sent, retain the original payment and track an agreed supplier credit or recovery separately.
- Execute customer refunds only for an admin-approved amount against the original captured payment. Reserve the refundable amount atomically; exclude prior and pending refunds. Use provider refund idempotency and confirm the refund result before notifying completion.
- External bank refunds require uploaded evidence and reserve the same refundable balance under the per-payment lock; pending or uncertain gateway refunds block that fallback. External-payment refunds remain an evidence/reconciliation workflow. Never pretend an external receipt is refundable through Razorpay.
- File replacements, quantity/address edits, shipping revisions and reprints after capture require staff review and a new version/change record. A previously accepted order retains its exact approved print snapshot.
- Damaged/returned/RTO parcels, partial fulfilment, lost shipments and reprints require linked cases and explicit cost responsibility. Do not silently refund print costs or create duplicate shipments.

## Screens and permissions

OpenShelf Accounts: provider/setup readiness, charges needing approval, held orders, daily batch manifests, payout state, reconciliation/errors, credits, refunds and CSV remittance export. Staff may inspect and gather evidence; admins approve financial amounts and configuration. Authors/customers see only their own orders, invoices, refunds and tracking, never supplier banking details or margin.

OnlinePrintingz order panel: source order, exact PDFs/specifications, supplier invoice and final charge components, settlement status/batch/UTR, and print-stage controls. Settling a supplier invoice must not call customer `payment_complete`, send a second retail bill, reduce unrelated inventory or book a courier.

All writes require session/role checks, same-origin protection, validated amounts/identifiers, concurrency/version checks and audit records. Private PDFs and supplier documents remain access controlled. Secrets, full banking credentials and raw provider payloads do not reach browser state, exports or logs. CSV cells must neutralise spreadsheet formulas.

## Provider and hosting design

Use Razorpay checkout for collection and a separate RazorpayX payout adapter for the supplier remittance. These are separate products and activation/funding requirements. A linked account/Route split is optional future work; do not assume Route eligibility.

RazorpayX's documented IP allowlisting requirement means the Cloudflare worker needs a fixed-egress relay. Prepare a small server-side relay with fixed provider destinations, HMAC authentication, timestamp/replay controls, a pinned beneficiary, amount ceilings and operation allowlists. Deploy on an approved host with a static outbound IP; keep provider keys there. If provider allowlisting also applies to the Payment Gateway account, use this same approved egress for affected payment/refund API calls. There is no arbitrary URL proxy or client-supplied beneficiary.

Official references checked 2026-11-16:

- https://razorpay.com/docs/api/x/payouts/create/bank-account/
- https://razorpay.com/docs/api/x/payout-idempotency/make-request/
- https://razorpay.com/docs/x/payouts/best-practices/
- https://razorpay.com/docs/webhooks/validate-test/
- https://razorpay.com/docs/api/refunds/create-normal/

## Acceptance and launch gates

Automated checks cover two customers/addresses, exact price totals, file retention, duplicate checkout/transfer, insufficient funds, payout timeout then retry, concurrent submission, malformed/wrong-amount/wrong-beneficiary webhooks, stale updates, late reversal, refund before/after batching, duplicate refund, cancellation/credit carry-forward, unauthorized roles, CSV privacy and IST date boundaries. All bank/provider calls are mocked in repository tests. Test-key acceptance needs actual provider test credentials and deployed webhooks/relay.

Production readiness checklist must distinguish completed software from external setup:

1. Merge/deploy source, apply migrations with backup, install compatible WordPress connector, verify shared secrets and scheduled triggers.
2. Legal business, invoice/tax policy, royalty agreement, cancellation/refund/reprint responsibility and settlement terms approved.
3. Final book files, real ISBN where required, author proof acceptance, valid size-rate mapping, measured package weight/dimensions and shipping setup.
4. Razorpay payment and RazorpayX payout activation/KYC; separate secure API/webhook configuration, payout source account, verified printer beneficiary and sufficient funded balance.
5. Fixed-egress host provisioned, TLS and service secrets configured, outbound IP allowlisted and health/test calls successful.
6. End-to-end test-key payment, one-order printer transfer, multi-order remittance, refund and reversal checks, and provider-confirmed reconciliation.
7. Admin explicitly enables live collection/printing/payouts after reviewing the readiness report; initial batches require approval.

KYC alone cannot honestly be called the only remaining task until the other external setup and acceptance checks above are verified. Live bank transfers, beneficiary/account changes, binding policies and production activation remain controlled owner actions.
