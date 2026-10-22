# Fuji Purchasing Hub

A complete MIS 4173 Team 2 web app for purchase proposals, dated management approvals, accounting purchase orders, delivery tracking, and searchable purchase history. It implements Chase Burton's email requirements and the supplied purchase proposal and purchasing procedures.

**Private app:** https://fuji-purchasing-hub-team2.flowyrice1.chatgpt.site

## What is included

- Purchase proposals with department, priority, needed-by date, item/part descriptions, quantities, prices, business explanation, supplier and contact details, quote number, three competitive quotes, and project manager.
- Server-enforced approval routes, exact decision timestamps, emergency verbal approval records, supervisor absence, and rejection reasons.
- Revision and resubmission with a complete prior-version snapshot and an append-only activity history.
- Accounting-only PO, account number, purchaser initials, order date, carrier, shipment tracking, delivery, and invoice-to-accounting dates.
- Private file attachments (PDF, JPG, PNG, or text, up to 10 MB each).
- Search, status/department/priority/order-stage filters, reorder from a prior purchase, summary reporting, and print-to-PDF through the browser.
- Excel/Google Sheets CSV exports: request summary, purchase line items, and approval activity. Full JSON exports include quotes and prior revisions.
- Persistent D1 records and R2 files. Browser storage is not used for purchasing records.
- Sixty-four fictional sample requests with 72 line items, varied approval states, orders, departments, and suppliers. The shrink-wrap item and amount are reference-inspired; every sample's people, supplier, decisions, and orders are simulated.

## Try the workflow

The hosted app requires ChatGPT sign-in and starts owner-private. The first authorized visitor becomes the workspace owner.

1. Open the app and choose **Try employee view** (Maya Thompson).
2. Create a proposal or revise one of Maya's rejected sample requests.
3. Use **Viewing as** to switch to Daniel Brooks (Supervisor), Morgan Blake (Controller), and Natalie Reed (Vice President), as required by the displayed approval route.
4. Switch to Alex Parker (Accounting) and record the PO, order date, and tracking details.
5. Search **Purchase history**, then use **Export data** to download a CSV.

Demo personas can only see and change sample records. A proposal submitted as the workspace owner is a separate, non-sample record. Demo switching is available only to the authenticated owner; it is not a way for another visitor to obtain a role.

## Local development

Use Node.js 24 or newer and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

The portable starter prints its local URL, normally `http://localhost:5173`. Local sign-in is provided by the portable Sites starter; open its **Sign in with ChatGPT** link. Hosted sign-in remains platform-managed. Managed Linux environments use their supplied preview supervisor rather than a separate development server.

```sh
pnpm test
pnpm typecheck
pnpm build
```

`pnpm db:local` applies pending schema migrations to the local database and is safe to run again. Local and hosted data are separate. The first signed-in API request seeds the fictional dataset once. `data/sample-requests.json` is a reproducible source dataset, not a backup of live user data.

To change the schema, edit `db/schema.ts`, run `pnpm db:generate`, inspect the new migration, and run `pnpm db:local`. Keep applied migrations immutable. Samples remain outside schema migrations.

## Roles and collaboration

Employees see their own requests. Supervisors review their assigned departments. Controller, VP, Plant Manager, Treasurer, and Accounting have operational visibility; approvals and order writes still require the correct role. Self-approval is blocked.

Real users require both platform access to this private Site and a matching membership in **People & access**. The owner can add or update operational memberships without sending invitations. Once a real member signs in, the membership binds to the stable Site user ID. Only the platform owner can switch among demo personas. Changing a member's role preserves their identity and existing requests.

## Approval policy decisions

The 2012 procedure overlaps at exactly $150. The implementation assigns $150 to the basic tier. The next tier requires a supervisor plus either Controller or VP. High-value requests require all three. Raw materials require Plant Manager or Controller. These interpretations, including sequential routing and the emergency rules, are explicitly documented in [the requirements](docs/requirements.md).

## Project map

- `app/components/PurchasingApp.tsx`: responsive workspace, forms, review screens, history, reports, exports, and member administration.
- `app/api/`: protected workspace, proposal, approval, order, member, and attachment endpoints.
- `lib/purchasing/domain.ts`: validation, routing, role checks, dates, calculations, and safe CSV generation.
- `lib/purchasing/server.ts`: identity, persistence, optimistic concurrency, and transactional audit writes.
- `lib/purchasing/seed.ts`: deterministic fictional dataset.
- `db/schema.ts` and `drizzle/`: database schema and generated migrations.
- `tests/`: business-rule tests and real API-handler tests using SQLite through a D1-compatible adapter.
- `docs/requirements.md`: field mapping, acceptance criteria, assumptions, and export guidance.
- `docs/architecture.md`: data and authorization design.
- `docs/review.md`: final review findings, fixes, validation, and limits.

The app retains the supported Sites/Vinext starter integrations for Cloudflare hosting. `.openai/hosting.json` contains binding names and Site identity, never credentials. Runtime keys, local databases, files, caches, and deployment archives are ignored by Git. The supplied source PDFs, real signatures, and private contact details are not included in this repository.
