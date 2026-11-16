# Google Play Books — collection A0HEG97

## Current state

The account and collection code were supplied by the owner. Code prepares a protected
Google Automated Content Fetcher feed; it is disabled by default. No real edition is
staged, no Google form has been submitted, and no Google validation or sales are claimed.
This is delivery infrastructure, not a public Google Books publishing REST API.

The first release is deliberately curated. Existing print catalogue entries do not
automatically become e-books: their print price, cover wrap, trial ISBN and sales-rights
confirmation cannot be assumed to apply to the digital edition. Website changes do
not change a staged release. Rebuild/stage a new release for approved updates.

## Remaining sequence

1. Confirm the Google account's payment profile, sales territories, bank/tax requirements
   and any account review messages in Partner Center.
2. Select one approved e-book edition. Supply the actual allocated eISBN and evidence,
   final PDF or EPUB, a front-cover JPEG, author(s), language, publisher, publication
   date, description, e-book price and permitted countries. The packager supports
   ISBN-based feeds only; titles without ISBN need a separately confirmed Google
   identifier workflow. Never submit the earlier trial ISBN 9780000000002.
3. Confirm digital distribution rights and no conflicting KDP Select enrolment. Validate
   PDFs visually and EPUBs with EPUBCheck; file signatures alone are not final QA.
4. Build and review a release locally (see below). Google must validate the ONIX sample;
   local XML parsing is not ONIX schema validation or acceptance by Google.
5. Merge/deploy this code, then stage the approved release in private R2. Use the existing
   BUCKET binding. No database migration or change to printing/payment automation.
6. Set these Cloudflare variables/secrets:
   - `GOOGLE_BOOKS_FEED_MODE=validation`
   - `GOOGLE_BOOKS_FEED_USERNAME` — dedicated alphanumeric user, at most 64 characters.
   - `GOOGLE_BOOKS_FEED_PASSWORD` — dedicated alphanumeric secret, 32–128 characters.
   Do not reuse printing/OAuth secrets. Never put passwords in URLs or source control.
7. Verify unauthenticated requests return 401. With credentials, `/onix/validate/`
   lists the sample and supports GET/HEAD. Rights directories and e-books return 404
   in validation mode. Check this on the deployed domain before requesting a crawl.
8. Submit Google's automated fetch setup form as **a publisher sending directly**, using
   collection `A0HEG97`, HTTPS and the dedicated credentials via Google's form only.
   Supply the actual sample filename and URLs after deployment/staging verification:
   - Metadata root: `https://openshelfpress.com/onix/`
   - Validation directory: `https://openshelfpress.com/onix/validate/`
   - Content root: `https://openshelfpress.com/ebooks/`
   - Content collection: `https://openshelfpress.com/ebooks/A0HEG97/`
   Request a daily schedule initially. Do not claim these URLs are ready before checks.
9. After Google's confirmation and approval of the first title/price/territory settings,
   change feed mode to `live`. Verify Google receives the rights feed and content and
   inspect the title's processing/sale status in Partner Center. Google controls review
   and availability. Automated delivery does not guarantee acceptance or sales.

## Package an approved release

Create a private JSON file (do not commit it or book files):

```json
{
  "collection": "A0HEG97",
  "publisher": "OpenShelf Press",
  "release": "Release20261116A",
  "books": [{
    "isbn": "REPLACE_WITH_ALLOCATED_EISBN",
    "isbnAllocationVerified": true,
    "digitalRightsConfirmed": true,
    "finalFilesApproved": true,
    "kdpSelect": false,
    "title": "REPLACE_WITH_APPROVED_TITLE",
    "authors": ["REPLACE_WITH_AUTHOR"],
    "description": "REPLACE_WITH_APPROVED_DESCRIPTION",
    "language": "eng",
    "publicationDate": "2026-11-16",
    "countries": ["IN"],
    "currency": "INR",
    "priceMinor": 9900,
    "priceTypeCode": "02",
    "format": "pdf",
    "contentPath": "interior.pdf",
    "coverPath": "front.jpg"
  }]
}
```

The price above is an example, not an approved OpenShelf price. Confirm its tax type
against Payment Centre. Paths are relative to the JSON file. Countries are explicit;
this tool never assumes worldwide rights. Use a new alphanumeric release ID each time.

```bash
node scripts/build-google-books-feed.mjs /private/approved-books.json /private/new-google-release
python3 scripts/upload-google-books-feed.py /private/new-google-release
```

The second command is a dry run. To stage remotely, install `boto3` in a dedicated
Python environment and supply these environment variables securely:
`GOOGLE_BOOKS_R2_ACCOUNT_ID`, `GOOGLE_BOOKS_R2_BUCKET`,
`GOOGLE_BOOKS_R2_ACCESS_KEY_ID`, `GOOGLE_BOOKS_R2_SECRET_ACCESS_KEY`.
The credentials must be scoped to the intended bucket; keep the bucket private.

```bash
python3 scripts/upload-google-books-feed.py /private/new-google-release --upload
```

The uploader checks local hashes, uses conditional writes for release objects, reads
back remote bytes, then conditionally switches `active.json` last. Failed staging leaves
the prior active manifest in place. An upload does not change feed mode or submit
anything to Google. R2 staging itself needs a live verification once access is available.

## Updating and withdrawing titles

New metadata/prices/files require a new release, review and staging. A missing title
in a later feed is NOT a retailer takedown. This initial packager does not implement
withdrawal ONIX. Use Partner Center/support for an urgent withdrawal and record it;
do not just remove a book locally. Disabling feed access also does not unpublish titles
Google has already ingested. Sales/royalty report imports are outside this first change.

To pause future ingestion, unset feed mode. To roll back hosting, restore a previously
verified release manifest to the active key while disabled. Google may already have
processed an update; reconcile in Partner Center before re-enabling.

## Official references

- [Automated content fetching](https://support.google.com/books/partner/answer/2763162?hl=en)
- [ONIX 2.1 fields](https://support.google.com/books/partner/answer/3413452?hl=en)
- [Automated fetch setup form](https://support.google.com/books/partner/troubleshooter/6262848?hl=en)
- [Payment profiles](https://support.google.com/books/partner/answer/3250840?hl=en)

## Distribution priority

1. Google direct automated feed — this preparation; account/feed validation outstanding.
2. PublishDrive API — paid API-enabled plan/custom agreement and credentials outstanding.
3. StreetLib API — access approval and commercial terms outstanding; select one aggregator
   route per store/format to avoid duplicate deliveries.
4. Ingram publisher integration — commercial onboarding and integration access outstanding.

Lulu's Print API is fulfilment, not marketplace publication; keep it a separate project.
