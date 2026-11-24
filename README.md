# Fuji Purchasing Register

The Fuji Purchasing Register is a spreadsheet-style web app built by East Carolina University’s MIS 4173 Team 2 for Fuji’s internal purchasing workflow. It follows a proposal from the employee’s request through approval, ordering and receipt. Staff can search earlier purchases, reuse a proposal and export the results to Excel.

[Open the hosted V5 app](https://fuji-purchasing-complete.averysteffensen.chatgpt.site) (authorized access required). To try the register with fictional records, follow the local setup below.

## How the register works

| Who | What they can do |
| --- | --- |
| Requester | Enter items, quantities, prices, supplier details, priority and a needed-by date. Follow the request, revise it after rejection or withdraw it while it is pending and unordered. |
| Approver | Review the assigned step, record a dated approval or give a reason for rejection. The purchase type and total determine which approvals are required. |
| Accounting | Record the purchase order number, order date, shipment tracking, receipt and final invoice. The register shows the difference between the approved total and final invoice. |
| Workspace owner | Manage member access, switch between fictional users for demonstrations, and verify, download or restore backups. |

**Purchase requests**, **Approvals** and **Purchase history** show one request per row. Users can sort the columns, combine filters and spot overdue requests marked in red. An Excel export includes up to 25,000 matching requests across all pages, in the selected order. Separate request and line-item sheets make it possible to build a PivotTable by department, supplier or part. Dates and amounts keep their spreadsheet types.

## Member access and training

In **People & access**, supervisors can add or remove people whose only role is Employee. Higher-level managers can add, edit or remove members whose roles are all below their own highest role. To add someone, enter their ChatGPT sign-in email, choose their roles and select **Add member**. To end access, select **Remove** beside their name and confirm **Remove member**. Their purchasing history stays on record. To restore access, open **Removed members**, select **Re-add** and choose the roles they need now. Supervisors cover every department. The [access guide](docs/security.md) lists the levels.

For instructor practice, assign the approval roles used by the exercise and Accounting. Have the instructor submit one proposal, then open another person’s pending proposal to practice approval and ordering. **View As** opens an eligible person’s register in read-only mode. **Exit View As** returns to the signed-in account.

## Run the local demo

Install Git and Node.js 24 or newer. From a terminal, run the following commands. The package manager version matches the one used by this repository’s GitHub Actions workflow.

```sh
git clone https://github.com/AverySteffensen/Fuji-Project.git
cd Fuji-Project
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

On the same computer, open [the local register](http://localhost:5173). Local development provides a test sign-in. A new database starts with 64 fictional requests and eight sample users. Use **Workspace role** to try the employee, approver and Accounting views. Local records and files stay in the checkout’s development storage.

## Hosted backups

The hosted app is scheduled to back up daily at **3 a.m. Eastern** and retains completed snapshots for **30 days**. A snapshot covers purchases, approval history, attachments and the member directory. In **Workspace tools**, the owner can see the last successful scheduled backup, verify its contents and download an encrypted copy for Fuji to store separately. The repository also includes an optional uptime monitor that requires its own deployment and alert destination. See [backup and recovery instructions](docs/operations.md).

## Development and project documentation

The app is written primarily in TypeScript and uses React and Vinext. Cloudflare D1 stores purchasing records and Cloudflare R2 stores private files. The local development command creates the backup key and operations token in the ignored `.dev.vars` file. Keep the original backup key to recover archives created with it.

```sh
pnpm test
pnpm typecheck
pnpm benchmark
pnpm build
```

| Guide | What it covers |
| --- | --- |
| [Requirements](docs/requirements.md) | Purchase approval rules, requirement IDs and outstanding acceptance checks |
| [Architecture](docs/architecture.md) | Application structure, data storage and request processing |
| [Access and security](docs/security.md) | Sign-in, member permissions, files and audit history |
| [Verification record](docs/verification.md) | V5 tests, benchmark results and hosted checks |

V5 is on `main`. The [V3 branch](https://github.com/AverySteffensen/Fuji-Project/tree/requirements-completion) and the [spreadsheet-interface branch](https://github.com/AverySteffensen/Fuji-Project/tree/spreadsheet-interface) preserve earlier versions.
