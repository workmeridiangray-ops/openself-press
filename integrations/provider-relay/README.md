# Static-egress provider relay

This is a separate Node 24 service. It must run on a host whose outbound public IP is stable and allowlisted in the correct Razorpay account. Putting this service on an ordinary dynamically egressing Worker does not satisfy that requirement. No hosting purchase or account activation is included in the source change.

Only signed requests from the OpenShelf server are accepted. The relay pins the provider origin, debit account, printer beneficiary, transfer mode and payout ceiling. It never accepts arbitrary URLs or bank recipients. `/health` is authenticated too. Bank operations are disabled until the activation flags and configuration validate. A timeout is an uncertain result, not proof of failure.

## Deployment

1. Provision an owner-approved static-egress Linux host with Docker Compose. Point a dedicated hostname at its IP. Allow inbound 80/443; do not publish port 8080. Configure provider IP allowlisting using the actual outbound IP, which may differ from the inbound address behind NAT.
2. Copy this directory to the host. Copy `.env.example` to `.env`, restrict it to the deployment account (`chmod 600 .env`), and enter values through secure hosting controls. Never commit it. Set a separately generated 32+ character `RELAY_SECRET` and the identical Worker `PROVIDER_RELAY_SECRET`.
3. Start in `PAYOUT_MODE=test`. Use the same test Payment Gateway account/key pair on the relay and Worker. The Worker needs its key ID for checkout and secret for checkout signature validation. Set `PAYOUT_SOURCE_ACCOUNT` to the source RazorpayX account number, not the printer bank number; set `PRINTER_FUND_ACCOUNT_ID` to the verified provider fund-account ID. Configure matching limits in the relay and OpenShelf Accounts.
4. Only after verification, set `ALLOWLIST_CONFIRMED=1`; only after the correct provider payout account/beneficiary is ready set `PAYOUT_ACTIVATION_CONFIRMED=1`. These flags record setup; they do not perform KYC, fund the account or verify a bank account by themselves.
5. Run `docker compose config --quiet` then `docker compose up -d --build`. The included Caddy service obtains HTTPS for `RELAY_DOMAIN`; DNS and ports must be reachable. Do not add body/header logging or expose `.env` in a web root. Pin container digests under your host's normal deployment policy.
6. Set Worker `PROVIDER_RELAY_URL=https://your-relay-hostname` (origin only). Open `/admin/accounts` and use **Check provider setup**. An unsigned browser visit returning 403 is expected.
7. Configure both signed provider webhooks and finish the acceptance run in [the launch guide](../../docs/SETTLEMENT_LAUNCH.md).

Changing `.env` requires recreating the service (`docker compose up -d --force-recreate relay`). Test and live keys, accounts and beneficiaries are separate. Never change environment to recover an uncertain request. Retain the ledger and its original request; reconcile with the provider first. Regenerating shared PG/X API keys affects both products; update the Worker and relay together.

## Checks without provider traffic

From the repository root run `node tests/provider-relay.mjs`. It starts an isolated local server and substitutes every provider request. No credentials, transfers or refunds are used. Run `node --check integrations/provider-relay/server.mjs` for syntax validation.

Back up the Worker D1 financial ledger through the existing platform backup process. The relay intentionally keeps no independent payment ledger: all retry keys and immutable requests persist in D1 before submission. On uncertain checkout creation, its in-memory replay guard is only secondary; the durable checkout claim prevents another provider order after restarts.
