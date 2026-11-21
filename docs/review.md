# Initial implementation review (October 22, 2026)

This historical review compared the original purchase-request workflow with the client’s correspondence, sample forms and written purchasing procedure. It describes the original CSV export and test suite. For current Excel exports, backup behavior and test results, see the [README](../README.md) and the [V5 verification record](verification.md).

## Improvements completed during review

| Finding in the original implementation | Change made on October 22 |
| --- | --- |
| Demo users could reach live proposals | Limited demo users to sample records and labeled sample rows. |
| A rejected emergency proposal could still be ordered | Required revision after rejection and added a test for that case. |
| Search covered only the first item | Indexed all item descriptions, part numbers, quote vendors and numbers, plus department, project manager and business explanation. |
| Approval dates could change around UTC midnight | Used Eastern business dates for comparisons and kept UTC timestamps in the audit history. |
| Editing a role could affect ownership | Kept stable member IDs and sign-in associations through role changes. |
| Membership matching relied on email | Bound the member record to the stable Site user ID on first verified sign-in. |
| Rejection history showed only a reason | Saved the previous proposal and made it available from the activity view. |
| Two reviewers could act at the same time | Tested simultaneous decisions. One change succeeded and created an audit event. The other returned an HTTP 409 conflict. |
| Attachment metadata and the request could be saved separately | Saved the metadata, request version and audit event together. A failed write removed the newly uploaded R2 object. |
| The CSV export omitted additional form details | Included competing quotes, emergency details, supplier selection notes, contacts, dates, attachment names and order notes. |
| User-entered text could be interpreted as a spreadsheet formula | Treated formula-like values as text in CSV output and tested quoting, line breaks and UTF-8. |
| Secondary text was difficult to read | Darkened text, enlarged table labels, added visible focus states and clarified sample badges. The table could scroll horizontally on narrow screens. |
| A dialog could use an outdated busy state | Updated the Escape handler to use the current state and retained keyboard focus handling. |
| Route handlers could receive malformed or oversized JSON | Bounded the request body, validated its structure and returned a 400 or 413 response when appropriate. |
| The ready-to-order count could include orders already placed | Counted only requests matching that fulfillment stage. |
| Sample requests contained only one item | Added eight multi-item examples, giving 64 requests and 72 purchase lines. |
| Local setup required manual SQL | Added a migration command that applied pending migrations. |
| Dense formatting made the source difficult to review | Formatted the application, tests and documentation consistently. |

## Verification at the time

- All 30 automated checks passed against the domain rules and API handlers, using SQLite through a D1-compatible adapter.
- Coverage included approval thresholds and exceptions, role and record permissions, self-approval, rejection, resubmission, prior revisions, order entry, dates, exports, attachments and concurrent updates.
- The initial migration ran successfully. Repeating it checked that previously applied migrations were skipped.
- The release checklist called for type checking, a production build and a source review for credentials, runtime data, source PDFs and signatures.

The managed browser preview was unavailable during this review. The handler tests used test identities. Hosted sign-in, cross-device behavior, keyboard navigation and responsive layout still needed browser checks at that point.

## Purchasing policy assumptions

The team used the 2012 purchasing procedure Chase supplied. The [approval policy interpretations](requirements.md#approval-policy) explain the treatment of exactly $150, the middle tier, the sign-off order, the inclusion of freight and tax, and the 24-hour emergency follow-up period. The app displays these rules under **Purchasing policy**.
