# Purchasing requirements

The IDs follow Team 2’s requirements register. Chase Burton supplied the purchasing workflow and operating estimates. The team also defined acceptance targets and added withdrawal and invoice variance tracking. The [verification record](verification.md) identifies which checks ran locally and which ran against the hosted app.

## Functional requirements

| ID | Behavior in V5 |
| --- | --- |
| FR01–FR02 | Sites verifies each visitor’s identity. The app checks active membership, assigned roles, access-management level, record ownership and approval authority before granting access. |
| FR03–FR05 | An employee submits a purchase type, priority, item details and business explanation. A valid draft becomes a numbered Pending request at revision 1 with its requester and submission time. Invalid or canceled drafts create no record. Retrying the same submission returns the existing request. |
| FR06 | Employees can see their own requests, including dates, type, priority, status and details. |
| FR07–FR08 | The Approvals queue shows Pending requests the current reviewer can decide. Opening or leaving a request keeps its status. |
| FR09–FR12 | Each decision records the reviewer, time, step, revision and comments. Rejection requires a reason and stops the route. Approval notes are optional. The final required approval sets the request to Approved. The server rejects conflicting decisions. |
| FR13–FR14 | A request requires a department, supplier, needed-by date and at least one priced item. The server calculates totals from quantities, unit prices, freight and tax. Requesters can add supplier contact details, a quote number and up to three competing quotes. |
| FR15–FR16 | The server saves the approval route for each revision. Resubmitting a rejected request keeps its number, archives the previous revision and starts a fresh approval cycle. The emergency procedure permits early ordering after verbal authorization. |
| FR17 | The requester or Accounting can attach files to an accessible request. The app checks record access on download. |
| FR18–FR19 | Accounting enters the PO number, account, purchaser initials and order date. The request shows the approval date separately and tracks the carrier, tracking number or link, expected delivery, receipt and invoice-forwarded date. |
| FR20–FR21 | Staff can search authorized purchases by item, part, supplier, requester, department, quote, PO or explanation. Reorder starts a new proposal. Staff can sort results and filter an inclusive range on a selected date field. Blank dates sort last. |
| FR22 | The Purchase requests, Approvals and Purchase history tabs export matching authorized rows across pages in the selected order. A single export supports up to 25,000 requests. Purchasing policy and People & access each export their own table. These exports use Excel’s `.xlsx` format. |
| FR23 | The requester can withdraw a Pending request before ordering. The app keeps the record and its decisions, marks it Withdrawn and closes it to further approval. |
| FR24 | After written approval, Accounting can record the final invoice. The app and Excel export show the difference from the approved total in dollars and, when the approved total is nonzero, as a percentage. |

## Nonfunctional requirements

| ID | Requirement and evidence |
| --- | --- |
| NFR01 · Access | The server enforces role and record access on purchasing data, attachments, history and exports. Tests cover denied access and authorized sample roles. |
| NFR02 · Performance | Fuji estimated 60–100 requests per month and about four simultaneous users. The local benchmark tests four callers and 3,600 requests. The team targets a 95th-percentile search/filter time of 2 seconds and a 1,000-request export in 10 seconds. Hosted response times still need measurement. |
| NFR03 · Availability | The app allows access across all three shifts. The team’s target is 99.9% monthly availability. Measuring it requires hosted observations throughout the month, including maintenance periods. |
| NFR04 · Usability | The register provides labeled controls, visible keyboard focus, keyboard-accessible dialogs and an explicit Overdue label. Desktop workflow checks are recorded. Small-screen and broader keyboard checks remain open. |
| NFR05 · Reliability | D1 stores request updates, register entries and audit events together. Version checks reject competing edits. Submission retries return the same request. Restored records receive newer versions so stale clients must reload. |
| NFR06 · Backups | The hosted daily job is scheduled for 3 a.m. Eastern. Each completed snapshot is retained for 30 days. The owner can verify it and download an encrypted copy for Fuji’s servers. The November 21 release check verified a completed snapshot and its download. |
| NFR07 · Data consistency | Server-calculated amounts, approval and order statuses, and Eastern business dates carry through to the register and exports. Dates for approval, ordering and receipt have distinct meanings. |
| NFR08 · Spreadsheet compatibility | Excel workbooks contain filterable tables with numeric amounts and date cells. The exporter writes user-entered strings as literal text, including strings beginning with formula characters. |
| NFR09 · Transport and storage | The app enforces HTTPS for hosted requests and private responses for sensitive data. Private D1 and R2 hold records and files. Downloaded backups use authenticated encryption. Review provider-managed storage settings as part of hosted acceptance. |
| NFR10 · Sign-in | Active workspace members sign in through Sites. The app relies on the provider for authentication. |
| NFR11 · Audit history | Purchase changes retain the actor, time, revision and changed values. Database triggers block edits and deletions of audit records. Restoration preserves later events and records which purchases it restored or removed. |
| NFR12 · Accounting sessions | Accounting can leave the workspace open while the provider session is valid and end the session using Sign out. The app has no inactivity timer. A representative full-shift idle test on a Fuji workstation remains open. |
| NFR13 · Support alerts | The optional independent Worker can probe the app every minute, retry failed deliveries and report outages and backup failures. The team’s five-minute alert target requires a configured support receiver and a timed delivery test. |

## Approval policy

The implementation follows the purchasing procedure Chase supplied. The team assigned exactly $150 to the lowest tier, required sequential sign-offs and interpreted “within one day” as 24 hours. Ordinary approval tiers use the full estimate including freight and tax.

| Purchase | Required approval |
| --- | --- |
| Ordinary, up to and including $150 | Any Supervisor. If unavailable, Treasurer or Controller. |
| Ordinary, over $150 through $1,000 | Supervisor, then either Controller or Vice President. |
| Ordinary, over $1,000 | Supervisor, then Controller, then Vice President. |
| Raw materials, any amount | Plant Manager or Controller. |
| Production emergency | Prior verbal approval from the Plant Manager allows early ordering. Written approvals are due within 24 hours. |
| BA emergency | Prior verbal approval from the Controller or Vice President allows early ordering. Written approvals are due within 24 hours. |

Requesters cannot approve their own proposals. Accounting can record an ordinary PO after final approval. Rejected and withdrawn requests cannot be ordered. Pending, Approved, Rejected and Withdrawn describe the proposal. Ordered and Received describe fulfillment. The requester can read a rejection reason in the app.

## Open operating checks

The first live verification included an owner download. On-site acceptance still includes storing a copy on Fuji’s protected server, arranging custody of the recovery key and timing a representative restore in an isolated environment. Consecutive scheduled runs, uptime, alert delivery and hosted performance require observations over time. The [operations guide](operations.md) describes the checks.

## November 24 access revision

One account may hold multiple operational roles. Supervisors review requests across all departments. Authorized managers can add, edit, remove and re-add lower-level members. Supervisors manage Employee-only accounts. Removing access preserves purchases and approvals. View As provides read-only access to an eligible individual’s register. See the [access-management levels and restrictions](security.md).
