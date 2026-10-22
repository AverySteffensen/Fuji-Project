# Purchasing requirements and acceptance criteria

Source material: Richard Holm's Team 2 inquiry; Chase Burton's response; the attached Purchase Proposal Form examples (revision 09/26/22); Purchasing Procedures dated March 22, 2012. This document records implementation decisions without treating unconfirmed interpretations as new Fuji policy.

## Form and email mapping

| Source requirement                         | App behavior                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Item requested, estimated price            | One or more line items with description, part number, quantity, unit price, calculated line totals and request total     |
| Quote number if applicable                 | Optional primary quote number; three optional comparative quotes with vendor, quote number and amount                    |
| Brief explanation                          | Required business purpose and contents                                                                                   |
| Supplier and reason                        | Required supplier; optional selection explanation                                                                        |
| Supplier contact if applicable             | Contact name, email and phone                                                                                            |
| Department marked as on the PO             | All 15 department choices shown on the supplied form, including the printed numeric codes                                |
| Date and date needed                       | System submission timestamp and required needed-by date                                                                  |
| Facilities, Lease, Other                   | Purchase type; Raw materials added to apply the documented exception                                                     |
| Priority / “rush”                          | Employee chooses Normal or Rush; rush is visible in lists and detail                                                     |
| Requester signature                        | Trusted signed-in identity and submission timestamp, retained in audit history; not a legal electronic-signature service |
| Supervisor, Controller, VP signatures      | Role-authorized decisions with name, exact UTC timestamp and visible Eastern time                                        |
| PO number is added later by Accounting     | Excluded from employee submission; accounting-only order editor                                                          |
| Acct number / purchaser initials           | Accounting-only order fields                                                                                             |
| Invoice to Accounting                      | Optional invoice-forwarded date in accounting order details                                                              |
| Vendor contact / project manager           | Supplier contact fields and optional project manager                                                                     |
| Verify approval                            | Approval path, individual decisions, final approved date, status and audit history                                       |
| Revise and resubmit rejected proposals     | Requester can edit and submit a new revision; a full previous-version snapshot and all earlier events remain available   |
| Date approved and date ordered             | Distinct, prominent fields in request detail, tables and exports                                                         |
| Tracking information                       | Carrier, tracking number, HTTPS link, expected delivery and received date                                                |
| Find past purchases                        | Full search, filters, order history, supplier totals and reorder-from-history                                            |
| Excel / Google Sheets export               | UTF-8 CSV with request, line-item and audit formats; JSON backup includes complete nested records                        |
| Notifications not necessary                | No automatic email or external messaging. Rejection reasons are retained for manual communication                        |
| Pending, Approved, Rejected are sufficient | Proposal status remains these three values. Ordered/Received are independent fulfillment labels                          |

## Approval routes

| Type / amount                                      | Required sign-off                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ordinary purchase, total up to and including $150  | Immediate Supervisor; Treasurer or Controller if supervisor is unavailable                                      |
| Ordinary purchase, total above $150 through $1,000 | Immediate Supervisor, then either Controller or Vice President                                                  |
| Ordinary purchase, total above $1,000              | Immediate Supervisor, then Controller, then Vice President                                                      |
| Raw materials, any amount                          | Plant Manager or Controller                                                                                     |
| Emergency production                               | Prior verbal approval from Plant Manager; normal written approvals still required within one day                |
| Emergency BA                                       | Prior verbal approval from Vice President or Controller; normal written approvals still required within one day |

Rules use the complete estimated total, including freight and tax. This conservatively avoids under-routing purchases with extra costs. Approvals happen in displayed order and cannot be performed by the requester. Supervisors are limited to assigned departments. Final approved status is assigned only after every required step is complete.

## Explicit interpretations

1. The source's two lowest tiers overlap at $150. Exactly $150 is assigned to the basic tier.
2. The middle-tier wording is interpreted as Supervisor **and** either Controller **or** VP. The larger tier requires all three. Some sample forms do not display every signature prescribed by the old procedure; the written procedure governs app routing.
3. Sequential approval order is an implementation choice for a clear queue; the procedure does not specify parallel approval.
4. Raw-material approval replaces ordinary dollar-tier approval, matching the word “only” in the source.
5. “Within one day” is represented as a 24-hour deadline after the recorded verbal approval. Overdue written sign-offs are visibly flagged. An emergency order never changes Pending into Approved, and a rejected emergency cannot be ordered.
6. Only Accounting records purchase orders. This is a practical role assignment based on Chase's explanation of adding PO numbers.
7. No delivery carrier integration is assumed. Accounting records tracking details manually; links must use HTTPS.
8. There is no background email, notification, or supplier order transmission. Recording an order documents an order placed through Fuji's existing process.

## Acceptance criteria

- Required fields and finite nonnegative monetary values are validated server-side; request totals are recalculated rather than trusted from the browser.
- Employees cannot forge requester identity, approval status, PO fields, or final approval timestamps through submission.
- Approvals require the current step's role; duplicate, out-of-order, and self-approvals are blocked.
- A rejection requires a reason. Only its requester can revise a rejected proposal; previous versions remain immutable history.
- Accounting cannot order an ordinary pending or rejected proposal. Date ordered cannot precede the applicable final/verbal approval date or lie in the future.
- The current proposal version is required for every update. Conflicting writes return 409 and create no duplicate approval or audit event.
- Purchase records, decisions, attachments metadata and audit history persist in D1. File contents persist in R2.
- Authentication and membership are checked on every endpoint. Demo personas are owner-controlled and cannot access non-sample records.
- Data exports obey the currently visible records and filters, include every comparative quote and approval/order date, and neutralize spreadsheet formulas in untrusted cells.
- Search includes every line item's description and part number, supplier, requester, department, quote, PO, project manager and explanation.
- Controls have visible labels and focus indicators. Dialogs trap focus, support Escape and restore focus when closed. Tables can scroll on narrow screens.

## CSV guidance

Choose **Request summary** for one row per proposal. Choose **Purchase line items** to analyze parts, quantities and unit prices. In the line-item file, use **Line total** for item-level sums: **Request total**, **Freight**, and **Tax** repeat on each item and must not be summed across item rows. A true complete record export is available as JSON, including all prior revisions and attachment metadata.

Every seeded record has `sample: true`, and CSV exports include **Sample data**. All 64 seeded records are fictional; one shrink-wrap item and amount are inspired by a supplied example. Uploaded source PDFs and signatures are not redistributed.
