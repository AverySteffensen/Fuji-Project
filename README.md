# Fuji Purchasing Register

Fuji employees can submit purchase proposals, record approvals, track orders and export the register to Excel. The workspace owner can download encrypted backups for Fuji's servers.

## Current release

The `main` branch contains the current release of the [Fuji Purchasing Register](https://fuji-purchasing-complete.averysteffensen.chatgpt.site). The historical `requirements-completion` branch preserves V3.

The hosted app stores purchasing records in D1 and files in a private R2 bucket. Local development uses `.wrangler/requirements-v3`.

## Purchasing

- Full-width spreadsheet interface, top tabs, larger request text and Low / Medium / High priorities.
- Required proposal fields, line items, supplier contacts and quotes, validated amounts, and department-based approval routes.
- Dated decisions, emergency follow-up, rejection reasons, retained revisions, private attachments, reordering and Accounting-only PO/tracking fields.
- Requesters can withdraw Pending proposals before ordering. Withdrawal blocks later approvals and retains history.
- Accounting can record the final invoice amount, including zero. Details and Excel exports show its dollar and percentage variance from the approved total.
- Every purchase mutation records the user, time and old/new values. Database triggers reject updates or deletion of audit history.

## Register and exports

Filters, sorting, paging, access checks and full-result exports run on the server. Only the selected page and an opened request's history are sent to the browser. SQL indexes avoid downloading the entire dataset for each user.

The date shortcut shows the selected period or Custom dates. Every sortable column has a matching sort-menu option. Approvals hides its redundant status and order-stage filters. Purchase history omits Not ordered. A single available department needs no department filter. Filtering dates and sorting dates remain independent controls.

All tabs retain Export data in `.xlsx` format. Request exports include all matching pages in the current sort order. Values keep native numeric/date types, and user text remains literal. Withdrawn, rejected and received requests are excluded from overdue highlighting. The application uses Eastern time for business dates.

## Internal sign-in

Hosted sign-in identifies each user. Active workspace membership and server-side role and record checks control access. Accounting can leave a workstation open while its hosted sign-in is valid. The header includes explicit Sign out. See [security](docs/security.md).

## Backups and operations

Workspace tools provides manual backups, verification, encrypted downloads, stored-backup discovery and confirmed restoration. Snapshots cover purchases, audit history, attachments and a member directory. Completed snapshots stay in private storage for 30 days. Downloaded archives can be stored on Fuji servers and unpacked with the original backup key in an isolated recovery environment.

The daily job is designed to run at 3 a.m. Eastern, including weekends, while the app is closed. Workspace tools shows its last check-in, latest scheduled attempt and last successful scheduled snapshot. The independent uptime monitor has its own check-in, health measurements and support alert destination.

See [operations setup and recovery](docs/operations.md) and the [requirements status](docs/requirements.md).

## Development and Codespaces

Use Node 24 or newer and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

The dev command creates missing local secrets in ignored `.dev.vars`, preserving existing keys. Never commit that file. Keep the backup key to verify and open backups. Hosted runtime secrets are configured separately.

```sh
pnpm test
pnpm typecheck
pnpm benchmark
pnpm build
```

The benchmark uses the real API handlers with 3,600 requests and four concurrent users against a local SQLite D1 adapter. Hosted latency, capacity and monthly availability require production measurement. Browser QA needs the managed preview service, which may be unavailable in the authoring environment.

## Source map

- `app/components/PurchasingApp.tsx`: register and purchasing flows.
- `app/components/OperationsPanel.tsx`: backup, restore and monitoring tools.
- `lib/purchasing/register-server.ts`: indexed server queries and access scope.
- `lib/purchasing/domain.ts`: purchasing validation, withdrawal and invoice calculations.
- `lib/purchasing/backup-archive.ts`: authenticated encryption for portable snapshots.
- `lib/purchasing/operations.ts`: staged backups, signed manifests and atomic restoration.
- `lib/purchasing/monitoring.ts`: check history, coverage and operation alerts.
- `scripts/run-daily-backup.mjs` runs the scheduled backup.
- `operations/worker.ts` monitors availability and delivers alerts.
- `drizzle/`: append-only migration history. Run pending migrations before starting this version.

No live database, uploaded source form, signature, credential or runtime secret belongs in Git.
