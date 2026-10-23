# Fuji Purchasing Register

Purchase requests, dated approvals, purchase orders, and delivery tracking in a full-width spreadsheet interface.

## Use either version

| Version | GitHub branch | App |
| --- | --- | --- |
| Original workspace | `main` | https://fuji-purchasing-hub-team2.flowyrice1.chatgpt.site |
| Purchasing register | `spreadsheet-interface` | https://fuji-purchasing-register.flowyrice1.chatgpt.site |

The register is a separate Site with its own database and attachments. Saving a request in one version does not update the other. The original branch and publication are preserved.

## Interface and exports

- Top tabs for Purchase requests, Approvals, Purchase history, Purchasing policy, and People & access.
- A full-width grid with larger request text, sortable headings, and 25, 50, or 100 rows per page.
- Search requests, items, parts, suppliers, quotes, requesters, and PO numbers.
- Filter by department, status, order stage, and Low / Medium / High priority.
- Inclusive From / Through filters for submitted, needed-by, approved, ordered, expected, and received dates. Presets include the last 7 or 30 days, current month, and current year.
- Overdue requests appear in red when their needed-by date is before today and they remain unreceived. Rejected requests are excluded. Dates use America/New_York.
- Every tab has an Export data button that downloads a native `.xlsx` workbook.

Request exports follow the current tab, filters, and sort order across all pages. The workbook includes Requests, Line items, Approvals, Activity, and Export details. Currency and dates retain native Excel types. Tables support filtering and pivot analysis, headings and identifiers are frozen, and overdue formatting recalculates when opened.

Use Requests for complete request totals. Line items contains individual line totals, excluding request-level freight and tax. User text is exported as literal strings and cannot execute spreadsheet formulas.

## Purchase workflow

The forms retain department, needed-by date, item descriptions, part numbers, quantities, prices, freight, tax, business explanations, suppliers, contacts, quote numbers, competitive quotes, and project managers.

Server-enforced approval routes, emergency handling, rejection reasons, revisions, attachments, and dated history remain available. Accounting records PO numbers, account numbers, purchaser initials, order dates, shipment tracking, receipt dates, and invoice dates.

The owner can use Workspace role to review the built-in employee, manager, and Accounting workflows. Role switching remains owner-only. Real users require Site access and a matching membership under People & access.

## Development

Use Node.js 24 or newer and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

The portable URL is normally `http://localhost:5173`. The starter provides local sign-in on loopback hosts. Hosted sign-in is platform managed. Browser-based Codespaces requires forwarded-host development authentication configuration.

```sh
pnpm test
pnpm typecheck
pnpm build
```

Local and hosted records are separate. `pnpm db:local` safely applies pending migrations. The priority migration converts older Normal records to Medium and Rush records to High, including prior-revision snapshots. New requests accept only Low, Medium, or High.

The reproducible seed dataset is in `data/sample-requests.json`. Source provenance remains in `docs/requirements.md`. User-facing school-project notes and sample-data banners are removed.

## Source map

- `app/components/PurchasingApp.tsx`: register, tabs, purchase forms, reviews, orders, and members.
- `app/register.css`: spreadsheet interface and responsive styles.
- `lib/purchasing/register.ts`: filtering, sorting, and overdue classification.
- `lib/purchasing/xlsx.ts`: native Excel export.
- `lib/purchasing/domain.ts`: validation and purchasing rules.
- `lib/purchasing/server.ts`: identity, persistence, scoped records, and audit writes.
- `drizzle/`: schema migrations and priority conversion.
- `tests/`: business, API, date, migration, and workbook tests.

Sites/Vinext, D1, and R2 integrations are retained. Credentials, runtime state, original source PDFs, and signatures are excluded from Git.
