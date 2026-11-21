# Requirements implementation status

The current reference is the complete presentation with FR01–FR24 and NFR01–NFR13. The email and purchasing procedure remain the source of business rules. Targets below are acceptance criteria, not provider guarantees.

## Functional requirements

| IDs       | Implemented behavior                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR01–FR02 | Sites sign-in, membership checks, server-enforced roles and department scope.                                                                                                                                                           |
| FR03–FR05 | Validated submission, authoritative requester/date/status, calculated totals and confirmation. Cancellation creates no proposal.                                                                                                        |
| FR06      | Employee register and detail queries include only authorized owned requests.                                                                                                                                                            |
| FR07–FR12 | Only the current authorized reviewer can decide a Pending request. Rejections need reasons. Decisions retain dates, comments and history. Missing or conflicting updates record no decision. Final Approved status requires every step. |
| FR13–FR14 | Department, supplier, needed-by date, items, contacts, quotes, freight/tax and authoritative monetary calculations.                                                                                                                     |
| FR15      | Type/amount approval routing, department scope and emergency verbal approval with written follow-up.                                                                                                                                    |
| FR16      | Requester revision/resubmission retains previous versions and starts fresh approval steps.                                                                                                                                              |
| FR17      | Private R2 files through permission-checked attachment endpoints.                                                                                                                                                                       |
| FR18–FR19 | Accounting PO/account/initials, order date, carrier, tracking, expected/actual delivery and invoice-forwarded date.                                                                                                                     |
| FR20      | Search includes items, part numbers, suppliers, requester, department, quote, PO and explanation. Reordering starts a new proposal.                                                                                                     |
| FR21      | Inclusive date ranges, missing dates last, server sorting and pagination. Presets reflect the displayed selection.                                                                                                                      |
| FR22      | Every tab exports modern Excel. Register exports include every matching row across pages in selected order.                                                                                                                             |
| FR23      | Requester-only withdrawal of Pending unordered proposals, a separate Withdrawn state, blocked further decisions and retained history.                                                                                                   |
| FR24      | Accounting-only final invoice amount, dollar variance and percentage variance from the approved total, including typed Excel columns.                                                                                                   |

## Nonfunctional requirements

| ID    | Implementation and verification boundary                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR01 | D1 persistence, atomic record/index/audit batches, version checks, and conflict/concurrency tests. Restored versions advance beyond current versions to reject stale clients.                                                                                                                                             |
| NFR02 | Visible labels/focus, keyboard controls, focus-trapped dialogs, responsive tables and an explicit Overdue label. Browser interaction review remains required when preview is available.                                                                                                                                   |
| NFR03 | Every purchasing route checks hosted identity, active membership and record scope. Attachment and export routes use the same access rules.                                                                                                                                                                                |
| NFR04 | Server-calculated amounts and variance, bounded numeric inputs, real calendar dates and consistent Eastern business dates.                                                                                                                                                                                                |
| NFR05 | Standard `.xlsx`, typed dates and money, literal user strings, filterable tables and overdue formatting.                                                                                                                                                                                                                  |
| NFR06 | The daily job targets 3 a.m. Eastern. Workspace tools shows its latest attempt and last successful scheduled snapshot. Completed snapshots remain available for 30 days, including encrypted owner downloads for Fuji's servers. Confirm consecutive scheduled runs and time a representative restore.                                                        |
| NFR07 | Indexed filters and scoped exports. The local benchmark uses four concurrent members and 3,600 requests, equivalent to three years at 100 requests per month. Project checks are search/filter p95 at or below two seconds and 1,000-request export within ten seconds.                                                   |
| NFR08 | No shift/hour restrictions. A 24/7 independent monitor and monthly check/coverage metrics support the 99.9% target. Actual monthly availability cannot be certified by code or local tests.                                                                                                                               |
| NFR09 | HTTPS, HSTS, no-store on sensitive responses and private D1/R2 storage. Portable backups have AES-GCM encryption.                                                                                                                                                                                                         |
| NFR10 | Standard hosted sign-in and active workspace membership. Members open their authorized workspace without app MFA.                                                                                                                                                                                                         |
| NFR11 | Every business mutation logs actor/time/changed values. Database triggers reject modification/deletion. Restoration retains later history and logs the restored or removed records. No application endpoint edits audit history.                                                                                          |
| NFR12 | Accounting can keep the workspace open under a valid hosted session and explicitly sign out. Confirm the provider session lasts through a representative idle period on Fuji's workstation.                                                                                                                                                                                                          |
| NFR13 | Independent scheduled Worker probes every 60 seconds, alerts during app outages, retries failed deliveries and reports failed/overdue backups. Activation requires a configured operating account, KV, service authorization and support webhook. Five-minute notification timing must be verified with that destination. |

## Approval policy interpretations

- Up to and including $150: Supervisor, with Treasurer/Controller fallback when unavailable.
- Above $150 through $1,000: Supervisor then either Controller or Vice President.
- Above $1,000: Supervisor then Controller then Vice President.
- Raw materials: Plant Manager or Controller.
- Production emergencies: verbal Plant Manager approval. BA emergencies: verbal Vice President or Controller approval. Written approvals remain due within 24 hours.
- Totals include freight and tax. No self-approval. Only Accounting enters orders; ordinary orders require complete approvals. Rejected or withdrawn proposals cannot be ordered.

Withdrawn is a later, explicitly requested lifecycle addition to Chase's original Pending/Approved/Rejected statuses. Order/Received remain fulfillment fields. Operational support alerts serve the new monitoring requirement; purchase-status email notifications remain absent.

## Operational acceptance still required

Check scheduled snapshots on consecutive days. Have the workspace owner download an encrypted archive for Fuji's protected server, arrange separate custody of the recovery key, and exercise a representative restore. Verify the independent monitor and support alert receiver, confirm Accounting's workstation behavior, and measure hosted performance and monthly availability.
