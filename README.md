# Fuji Purchasing Register

Version 3 adds request withdrawal, final invoice variance, account protection, backup and restore, protected audit history, and server-side register filtering.

## Isolated versions

| Version                 | Branch                    | Hosted app                                                |
| ----------------------- | ------------------------- | --------------------------------------------------------- |
| Original workspace      | `main`                    | https://fuji-purchasing-hub-team2.flowyrice1.chatgpt.site |
| Spreadsheet interface   | `spreadsheet-interface`   | https://fuji-purchasing-register.flowyrice1.chatgpt.site  |
| Requirements completion | `requirements-completion` | https://fuji-purchasing-complete.flowyrice1.chatgpt.site  |

The third app has a separate Site identity, D1 database and R2 bucket. The other branches and publications remain unchanged. Its local database uses `.wrangler/requirements-v3`, separate from the earlier versions.

The remote `requirements-completion` branch must be created by an account with repository write access. A local branch or the hosted source repository does not prove that GitHub accepted a push.

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

## Account protection

Hosted sign-in remains with Sites. The app adds a server-checked, 15-minute idle authorization session and requires an authenticator for approvers, Accounting and administrators. Setup shows single-use recovery codes once. Authenticator secrets use AES-GCM encryption with a runtime key, recovery codes are hashed, attempts are limited and used TOTP codes cannot be replayed. One minute before idle expiration, the app warns the user and offers Stay signed in. Expired sessions cannot access purchasing APIs.

Every real privileged user must enroll their own authenticator. The workspace owner cannot use demo switching to bypass that check. See [security](docs/security.md).

## Backups and operations

Workspace tools provides manual backups, checksum verification, stored-backup discovery, confirmed restoration, and monitoring status. Backups include purchases, audit history, attachments and a directory of member identities. Completed snapshots remain in private R2 storage for 30 days. Signed manifests permit discovery after loss of the D1 backup catalog. Restoration preserves current account security and roles. Missing member identities return inactive, requiring an owner's access review.

A separate scheduled Worker supplies hourly backups, 60-second checks and support alerts. It can alert while the app is down. **This Worker, its KV namespace, private-Site service access and alert destination require deployment/configuration in the operating Cloudflare account.** The app accurately shows Not connected until callbacks arrive. The source does not claim that these schedules or a 99.9% monthly availability guarantee are already active.

See [operations setup and recovery](docs/operations.md) and the complete [requirements status](docs/requirements.md).

## Development and Codespaces

Use Node 24 or newer and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

The dev command creates missing local secrets in ignored `.dev.vars`, preserving existing keys. Never commit that file. Keep those keys to reopen authenticator secrets and signed local backups. Hosted runtime secrets are configured separately.

```sh
pnpm test
pnpm typecheck
pnpm benchmark
pnpm build
```

The benchmark uses the real API handlers with 10,000 requests and 25 concurrent callers against a local SQLite D1 adapter. Hosted latency, capacity and monthly availability require production measurement. Browser QA needs the managed preview service, which may be unavailable in the authoring environment.

## Source map

- `app/components/PurchasingApp.tsx`: register and purchasing flows.
- `app/components/SessionGuard.tsx`: MFA enrollment/challenge and idle warning.
- `app/components/OperationsPanel.tsx`: backup, restore and monitoring tools.
- `lib/purchasing/register-server.ts`: indexed server queries and access scope.
- `lib/purchasing/domain.ts`: purchasing validation, withdrawal and invoice calculations.
- `lib/purchasing/auth-security.ts`: authenticator cryptography and idle authorization.
- `lib/purchasing/operations.ts`: staged backups, signed manifests and atomic restoration.
- `lib/purchasing/monitoring.ts`: check history, coverage and operation alerts.
- `operations/worker.ts`: independent minute-by-minute monitor and backup runner.
- `drizzle/`: append-only migration history. Run pending migrations before starting this version.

No live database, uploaded source form, signature, credential or runtime secret belongs in Git.
