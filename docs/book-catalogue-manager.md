# Book catalogue manager

Staff and administrators open **Catalogue** in the admin sidebar (`/admin/catalogue`). The existing Google allowlists determine access. No new credentials, paid service or database migration is required; records use the existing D1 `records` and `activity` tables, and uploaded covers use the existing R2 `BUCKET` binding.

## Add one book

1. Click **Add book** and enter the title, author, retail price in INR and available stock.
2. Optionally enter your SKU, ISBN, genre, description, language, format, page count, trim size and publication date. An ISBN may be left blank; when supplied, its ISBN-10 or ISBN-13 checksum is validated.
3. Upload a front cover (PNG, JPEG or WebP, up to 5 MB), or paste an HTTPS image URL.
4. Choose **Published**, confirm the book and cover may be offered for sale, then **Save & publish**. The book appears in the public catalogue and existing cart/checkout on the next catalogue request. Other visitors should refresh an already-open storefront to see changes.

**Draft** saves privately for later editing. **Archive** removes a book from public listings without deleting its record or historical orders. Editing uses the saved record version so an old browser tab cannot overwrite a newer stock or metadata change.

## Import a list from Excel or Google Sheets

1. Click **Import book list → Download CSV template**.
2. Fill in the spreadsheet. The required columns are `title`, `author`, `price` (rupees, no currency symbol) and `stock` (whole copies). Keep optional cells blank when unknown.
3. Save/export as **CSV UTF-8**. Native XLSX files and PDF book files are not imported by this feature.
4. Upload the CSV (up to 200 books and 2 MB), choose Draft or Published, then click **Check & preview list**.
5. Correct any highlighted rows in the spreadsheet and upload it again. After every row passes, import the drafts or publish the books.

Published imports require a positive price and an HTTPS front-cover URL per book. For local cover files, import drafts first and upload each cover from **Edit book**. Stock zero is allowed and disables purchase buttons. CSV supports commas, quotes and multiline descriptions inside quoted fields.

Import is **create-only**. Existing SKU/ISBN matches and repeated books within the upload are flagged rather than overwritten. The whole import is revalidated when saved, then written in one D1 batch transaction: an insertion conflict rolls the entire batch back. Existing catalogue records created by older tools are included in duplicate checks. Use Edit book for updates; the list export includes IDs and statuses for reporting and is not the import template.

## Publishing and file boundaries

Direct catalogue entries represent existing books and do not create or approve manuscript projects, allocate ISBNs, transfer money, or claim retailer distribution. Existing production-linked listings retain their original edition references and approval requirements. Staff can still create those listings from the production workflow API.

Only Published catalogue records are projected publicly. Public responses exclude raw cover storage keys and internal ownership fields. A dedicated cover route serves only catalogue image objects; draft/archived images require staff authentication. Files in manuscript, receipt or evidence prefixes cannot be exposed through the catalogue. Uploaded covers are retained on replacement/archive, including unattached uploads after an interrupted save; automatic orphan cleanup is not included.

Once a managed catalogue exists, an empty public catalogue stays empty instead of restoring the built-in fallback books. Checkout also blocks fallback-book orders in that state. A temporary catalogue-read failure returns an unavailable response rather than advertising fallback inventory.

## Validation

- `npx tsc --noEmit`
- `node tests/catalogue-manager.mjs`: actual compiled API handlers with isolated SQLite/R2 adapters; permissions, CSV parsing, validation, publication, duplicate detection, transaction rollback, version conflicts, cover visibility and production boundaries.
- `node tests/complete-workflows.mjs`: existing checkout, inventory, finance, fulfilment and publishing workflow regression checks with mocked providers.
- `npm run build`: production bundles including the new admin and cover endpoints.

Live Google login, production storage bindings and browser acceptance should be checked on the deployed environment. No live customer books or orders are created by these tests.

## Prepared draft packages

The admin catalogue's **Update prepared books** panel accepts up to 50 prepared entries per package (2 MB total). Preview matches case-insensitive SKU and verifies the saved title. Apply uses preview versions to reject stale changes, updates existing direct drafts, and creates missing drafts. Published, archived and production-linked editions are excluded. Existing author credits and stock are retained.

Each row contains the standard book fields plus `printingCost` (rupees), `costBasis` and optional `coverData` (PNG/JPEG/WebP data URI, at most 500 KB). Printing costs and derived markup are private administrative fields; the public catalogue projects only retail prices. Covers use the existing dedicated R2 catalogue image path. Packages never publish listings. A conflict during application reports exactly which SKUs were saved so remaining rows can be previewed again; the package is not an all-or-nothing transaction.

For artwork-only changes, send `sku`, the matching `title`, `coverData`, and `coverOnly: true`. This requires an existing direct draft and retains all its saved prices, printing costs, ISBN, stock, author credits and other metadata. It cannot create a new listing.

Inventory-only packages use `stockOnly: true`, `sku`, the matching `title` and a whole-number `stock`. They update existing records, retaining prices, covers, credits, production links and listing status. The preview shows the new stock. Earlier static catalogue entries retain their data and default to 10 copies of ordering availability.

Author-credit packages use `authorOnly: true`, `sku`, matching `title` and `author`. They update direct draft books only, retaining price, stock, covers, ISBNs and all other stored fields. The preview displays the resulting author credit.
