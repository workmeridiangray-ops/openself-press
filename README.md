# Meridian Press publishing platform

Working application alongside the original Framer design project. The original 50 design screens, 312 prototype routes and original advanced editor have not been changed.

## Website and workspaces

Responsive public publishing pages, bookstore and book details, cart, order creation, purchases, manuscript enquiries and receipts, royalty estimator, contact and business policies. Catalogue listings are managed in the staff workspace; approved business content feeds public contact and policy pages. Sample books appear only before launch readiness is enabled when no live listings exist.

Protected author and staff workspaces share records in D1 and files in R2. Authors see only their own operational records and files. Staff permissions are checked on the server. Final file approvals, ISBN allocation evidence, author proof acceptance tied to the exact interior/cover versions, and production gates are retained.

## Manuscript studio

Rich text, headings, fonts, emphasis, alignment, ordered/bulleted lists, tables, links, text colour, undo/redo, find and replace, spellcheck, word count, zoom, DOCX import, DOCX generation, TXT export, browser print/PDF and immutable saved revision history. Imported and pasted HTML is sanitized; the server re-sanitizes stored HTML. DOCX conversion preserves supported text styles, not every Word layout feature; images, advanced page furniture, tracked changes and real-time collaborative editing are not implemented. Review exported typography and pagination before print production.

## Operations

- Catalogue draft/publish/archive, licensed cover links, approved edition references and stock availability. Unpaid orders reserve live stock; cancellation releases it once. Staff should review unpaid reservations because no automatic reservation expiry runs.
- Server-priced checkout requests with idempotency keys, verified online payment flow, manual external receipt recording, printable invoices, fulfilment steps, tracking references, delivery confirmation and return/refund requests.
- Sales and refund adjustments recorded in integer paise; channel costs and agreed net revenue share generate royalties. Statements allocate each sale once and support supplementary entries. This is an operational sales/royalty register, not a statutory general ledger or tax-filing system.
- Payout requests reserve statement balance atomically. Recording an external transfer does not send money. A different administrator must reconcile uploaded transfer evidence. Rejection/cancellation frees an unprocessed request.
- Distribution channel register with submission references and verified retailer listing links. Retailer submissions remain external operations. Shiprocket custom carrier-order creation and authenticated tracking sync are implemented; courier selection, shipping payment and pickup booking remain external operations.
- Service quotations, author acceptance/final review, campaign stage tracking with uploaded reports, support assignments, messages and resolution.
- In-app stage notifications, Resend sending with stable idempotency keys, retries and signed delivery callbacks. Unconfigured providers leave emails unsent. Original stage events and ISBN notifications attempt dispatch when configured.

## Owner and provider activation

OWNER_EMAIL is configured to the verified project-owner account. Sign in with that account, visit `/admin/overview` and activate owner access. Add signed-in team members using the user IDs displayed in their account settings. There are no default passwords.

Configure the runtime secrets listed in `.env.example`. Shiprocket uses an API bearer token and the exact registered pickup-location name. Razorpay creates provider orders server-side, validates checkout HMAC signatures against the stored provider order and verifies the captured amount/currency using the provider API before marking paid. Resend uses a verified sender. Callback paths are `/api/webhooks/razorpay` and `/api/webhooks/resend`; signatures are verified on the raw payload. Provider callback reachability must be tested after the intended hosting audience is configured; the private review gate may prevent external callbacks. Access has not been made public automatically.

No live payments, transfers, refunds or emails were performed during development. Provider tests use mocked HTTP responses. Live provider onboarding, sandbox transactions, delivery callback checks, final business details, approved policies, commercial pricing, licensed catalogue assets and production acceptance are required before customer launch. Payouts/refunds are records of externally completed transactions; the website does not initiate them.

## Development and verification

`npx tsc --noEmit`
`node tests/workflows.mjs`
`node tests/complete-workflows.mjs`
Then run the Sites build helper. Tests execute the actual compiled handlers against isolated SQLite and memory-backed file/provider adapters. Coverage includes authentication, record isolation, file/version/ISBN/final-proof gates, editor sanitization/revisions, royalty arithmetic, supplementary statements, payout balance and independent reconciliation, invoices, fulfilment, distribution, refunds, provider signatures, inventory reservation, cancellation and duplicate-checkout prevention.

Schema migrations remain in drizzle/. Temporary QA pages and sample operational fixtures are excluded from deployment.

## Completed journey and navigation checks

Help/FAQ (`/help`, `/faq`), publishing checklist (`/publishing-checklist`), publishing routes (`/plans`), catalogue-derived public author directory and author book pages are linked from the website. Permanent protected record detail URLs (`/workspace/records/:id`) show next actions, current manuscript, linked edition files, approvals and exact-record history. Authors can submit saved drafts for staff review; staff review the current saved revision and convert approved enquiries into book projects idempotently. ISBN allocation evidence has a separate authorized upload and preview instead of reusing the manuscript file. Production and Shipping read the actual paid-order queues. Staff Authors reads registered accounts and their book projects. Receipt pages require the matching reference. `/admin/launch-checklist` shows stored configuration checks while clearly distinguishing them from live acceptance tests.

Book publication has an explicit final state: after approved files, ISBN, proof acceptance and production, staff confirm a published catalogue listing for that edition. The project becomes Published and links directly to its bookstore page. This does not claim external retailer distribution.


## Restored author workflow from original uploaded ZIP

The original `meridian-press-cloudflare-pages(3).zip` was compared against this rebuild. The original opening form and guided author workflow had been replaced by generic records; those routes are now restored as an integrated journey.

- `/submit`: four-step author/contact, manuscript choice/upload, plan preference and review form. ChatGPT sign-in replaces the old password field; no duplicate account or password is collected.
- `/workspace/books` (also author Overview, My books and Publishing): own book shelf with direct print-journey and editor links.
- `/workspace/books/:id`: saved book information, print specifications, manuscript/interior, cover, distribution request, blurb/metadata/price and final submission checks.
- `/workspace/books/:id/editor`: original manuscript editor with page setup, typography, chapter/front/end sections, review comments and autosave. Saves and immutable revisions use the current D1 backend.
- `/workspace/books/:id/studio`: existing rich DOCX import/export studio. Saving here deliberately changes the manuscript to a continuous document; the original structured editor preserves chapter boundaries.
- `/workspace/books/:id/cover`: original layer-based cover designer (templates, drag/resize/rotation, shapes, alignment, background uploads) with persistent layout and a generated PNG review proof.
- `/workspace/books/:id/ebook`: original saved-manuscript reader preview and draft EPUB generation, plus an explicit download link and protected R2 storage. EPUB draft output requires retail validation; it is not certified EPUB conformance.
- `/workspace/books/:id/mockup`: original marketing cover mockup using the selected book's saved cover.
- Final submission requires book/specification metadata, manuscript, linked interior PDF and cover, requested distribution/formats and pricing. EPUB is additionally required when eBook is requested. Staff review/ISBN/final proof/production continue through the existing permanent record page, where all saved print specifications are visible.
- Creator PNG proofs are labelled review-only and blocked at the production gate; a final approved replacement cover is required. File replacement resets approval. Review/production locks, ownership checks and version conflict detection remain enforced.

Original promotional prices, countdown offers, retailer placement guarantees, copyright promises, free-copy entitlements and plan checkout are not treated as configured commercial products. Plan choices are requests for a confirmed scope/quotation. No plan charge, ISBN allocation from a government service or external retailer distribution is performed by these forms.

Run `node tests/book-journey.mjs` for the added ownership, structured-editor, cover, upload and final-submission checks. Browser walkthroughs use temporary synthetic fixtures; those routes and adapters are removed before deployment. Actual signed-in production acceptance remains required.


## Dedicated author accounts

- `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/account` provide author password access and profile/security controls. `/staff-login` preserves protected ChatGPT staff sign-in.
- Author credentials and sessions use dedicated D1 tables. Passwords use salted scrypt (N=16384, r=8, p=5, 64-byte key); only hashes of random session/recovery tokens are stored. Production session cookies are Secure, HttpOnly, SameSite=Lax and host-only. Default sessions last seven days; the optional persistent session lasts 30 days.
- Login and recovery attempts are rate-limited. Password changes/resets revoke existing sessions; reset/verification tokens expire and are consumed once. Mutations require an exact same-origin Origin header.
- Password accounts are always author-scoped, even if an administrator accidentally changes their membership row. Owner bootstrap refuses password sessions. A matching email never silently takes over another workspace. Existing author books can be explicitly linked only while authenticated to that exact ChatGPT author workspace and using its same email. Staff accounts keep their staff sign-in.
- Authors can work on their own draft books before verifying their contact email. Verification does not grant staff access or link other workspaces. Email changes are not exposed by this release.
- Verification and reset delivery need `RESEND_API_KEY` and a verified `EMAIL_FROM`. Without them, the UI explicitly disables recovery email. No default passwords or recovery tokens are exposed to the browser or staff records.
- **Hosting boundary:** this site remains owner-private. Its outer ChatGPT preview gate is independent of application author passwords. Removing that gate requires an explicitly authorised public audience change (or external hosting); the code does not bypass it.
- `node tests/author-auth.mjs` tests real compiled account handlers with SQLite; email calls are mocked. Complete signed-in acceptance, actual email deliverability and rate-limit tuning remain launch checks.

Frontend motion uses a small native IntersectionObserver component for one-time section entrances, plus CSS book-cover hover and button feedback. It respects reduced-motion preferences, adds no animation dependency and does not import or license a Framer Marketplace kit.


### Supplied Notion Press reference correction
The supplied `shared-screenshots.zip` has 39 September reference images. Book creation now groups saved stages under Book Information, Book Content Design (specifications/interior/cover), Distribution & Pricing, and Blurb and Metadata, followed by review. Removed the unsupported Starter/Foundation/Editorial/Imprint choice from new submissions; existing records are preserved. Retail prices belong to distribution and support optional India hardcase, international paperback/hardcase (USD) and eBook values. Costs, earnings percentages, distribution-package prices, discounted offers, free-copy promises and publication timelines are not adopted as Meridian business terms. The September competitor price examples are historical references, not configured charges.

The specification choices and square trim option follow the reference; the richer manuscript and cover tools remain. This correction covers the book-creation structure and pricing placement, not a claim of visual parity across every dashboard, service and marketing reference.


### Separate staff portal
Staff enter through `/admin/login` (legacy `/staff-login` remains compatible) and work under `/admin/*`. Public/author navigation, footer and login have no admin switch. The operations area has its own header and no storefront footer. Staff record detail links, author directory, queues and approvals remain under `/admin/records/:id`. The author interface shows only the signed-in person's records and activity, even when that person has staff privileges; server authorization remains unchanged. This is a separate section of the same deployment and database, not a second independent site.


### Author dashboard reference implementation
The author overview now follows the supplied Dashboard.html structure: sales insights, eight quick actions, draft/published book filters, per-book publishing/sales/promotion actions, ISBN/format/publication information, final file and editor links, and recent notifications. Source account identities, sales amounts, promotional claims, tracking scripts and time-limited competitor offers are not copied.

Metrics use only owned records. Net units count Posted/Allocated sales including negative refund entries; released earnings use Released royalty statements; the wallet deducts every non-cancelled/non-rejected payout reservation, matching the existing payout API. Reports support a selected-book filter. New milestones are derived from saved publishing records and sales; they carry no cash or royalty-boost reward promise. Marketing routes create existing reviewed Campaign requests; author copies create a Production support service request pending quantity, delivery details and quotation. Referral enquiries create support requests; there is no automated referral reward engine. No provider operation, payment or email is triggered by opening the dashboard. Prices remain unset, and staff still use the separate operations portal.

### Public website references from Archive 8
The supplied saved pages inform the public homepage, catalogue, book detail and publishing/service routes. The implementation uses the existing green/ivory brand, original 178 demo covers and original manuscript/cover editors; no competitor tracking scripts, reviews, account data, ratings, sales claims, commercial prices or time-limited promises are copied.

The homepage links to books, genres and authors. The bookstore supports title/author search, genre/language filters, sorting and 24-item pagination. Book details show actual published catalogue editions, recorded specifications, similar books, add-to-bag and checkout links. A PIN code check validates only Indian PIN syntax and explicitly does not claim courier availability or delivery timing. The public catalogue projects only selected listing and edition metadata; private manuscript text and internal listing notes are excluded.

Reader reviews use the existing shared records store: authenticated readers can submit one review per published listing, initially Pending, and authorised staff moderate under /admin/reviews. Only approved review text, display name, rating and date are public. Submission validation, hourly limits, deterministic per-reader/listing IDs and optimistic moderation versions apply. No external email is sent by the review workflow.

Publishing choices and expert service descriptions lead to an intake with language, manuscript stage and self-guided/expert preference. Selected services survive the login return path and save on the book project. Subtitle and up to ten co-author/editor/illustrator credits persist on book information and are visible for staff. No package fee is preset or charged; the earnings calculator starts blank and requires user-entered terms. External publishing/distribution/printing and live payments still require configured providers and confirmed business terms. This is a reference-informed implementation, not a claim of complete Notion Press feature parity.

### Archive 9 author operations

Author navigation now opens dedicated marketing managers, author-copy requests, sales reports, wallet/payment ledger, support, profile, referral enquiry and marketing-credit information. Coupon requests collect single-use/multi-use/bulk-use terms, quantity limits and dates; campaigns have searchable/filterable tables, CSV exports, cancellation, correction resubmission, messages and report links. These remain reviewed operational requests: the app does not issue redeemable codes, execute shipping subsidies, submit retailer promotions or purchase external ads. Staff progression records external execution and is not an integration claim.

Author-copy requests require a published owned edition, available binding, quantities, recipient/address and confirmation of approved interior/cover versions. Staff must quote an inclusive positive amount, the author accepts, then creates one idempotent unpaid order. Changed final files block ordering. Existing payment, invoices and fulfilment mechanisms handle the saved order. Invoice/request evidence can be attached to its service record. No author-copy fee, discount, minimum print run or shipping promise is preset.

Sales reports filter posted/allocated rows by channel and month with net returns and CSV exports. Wallet separates released statement earnings, reconciled payouts, pending reservations and available balance; the existing payout safeguards remain authoritative. No credit balance or referral reward has been invented. Support has categories, book linkage, replies, attachments and author close/reopen after staff resolution. Profiles are private by default and publicly project only opted-in name, biography, HTTPS website and linked published catalogue titles; no private account/address information is exposed.

Validation: `node tests/author-tools.mjs` covers the author API and rendered managers; extended workflow tests cover support resolution and copy quoting. Existing editor, authentication, ownership, review, financial and portal tests remain in place. Browser layout QA could not be completed in this environment because the managed preview URL refused the browser connection despite the preview daemon reporting running.
