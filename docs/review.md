# In-depth implementation review

Reviewed October 22, 2026 against the supplied correspondence, forms, procedure, and the implemented request-to-order workflow.

## Improvements completed during review

| Finding                                                           | Improvement                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sample personas could otherwise reach live proposals              | Server-side sample-only scope; the browser also shows sample labels in every request row                                               |
| Emergency exception could permit ordering a rejected request      | Rejected emergencies now require revision; a regression test covers the block                                                          |
| Searches focused on the first item                                | All item descriptions and part numbers, all quote vendors/numbers, department, project manager and business explanation are searchable |
| Approval dates could drift around UTC midnight                    | Calendar comparisons use Fuji's Eastern business date while retaining UTC audit instants                                               |
| Role edits could break ownership                                  | Stable member IDs and sign-in bindings survive role changes                                                                            |
| Sign-in email alone was being reused as the membership match      | Membership binds to the stable Site user ID on first verified sign-in                                                                  |
| Rejection history needed the original proposal, not just a reason | Complete prior-version snapshots are stored and can be expanded in the activity view                                                   |
| Concurrent decisions could create ambiguous history               | Conditional transactional updates and mutation-bound audit insertion; a two-writer test proves one winner and one 409                  |
| Attachment metadata could be written separately from the request  | Metadata, request version and audit event share a conditional D1 transaction; failed writes remove the new R2 object                   |
| CSV output omitted useful secondary form details                  | Comparative quotes, emergency details, selection notes, contact information, dates, attachments and order notes are included           |
| Spreadsheet formula injection                                     | Formula-like values are neutralized; quoting, newlines and UTF-8 handling are tested                                                   |
| Light secondary text was difficult to read                        | Darker text, larger table labels, visible focus states, clear sample badges, and responsive table scrolling                            |
| Modal Escape handler could retain an outdated busy state          | Close callback now follows the current state; dialogs retain focus handling                                                            |
| Arbitrary or oversized JSON could reach route logic               | Streaming body limit, object validation and clear 400/413 responses                                                                    |
| A ready-to-order card could show already ordered proposals        | A separate fulfillment filter now matches the card's label                                                                             |
| Dataset had only single-item examples                             | Eight multi-item proposals added: 64 requests and 72 purchase lines                                                                    |
| Local database setup required manual SQL                          | A repeatable migration helper now applies only pending local migrations                                                                |
| Dense source was difficult for students to review                 | Application source, tests and documentation formatted consistently                                                                     |

## Validation

- 30 automated checks pass: domain rules plus actual API route handlers running against SQLite through a D1-compatible adapter.
- Tests cover all dollar boundaries, raw materials, supervisor absence, role and record scope, self-approval, rejection, resubmission, full revision snapshots, PO restrictions, emergency ordering, date rules, safe exports, stable membership, attachments, anonymous access, cross-origin writes, malformed/oversized requests, and concurrent writes.
- TypeScript checking and a production build are required before the final source is published.
- Initial local database migration applies successfully; repeat execution is checked for idempotence.
- Source is scanned before publication to exclude credentials, local runtime data, uploaded source PDFs, and original signatures.

## Verification limits

The managed browser preview supervisor is unavailable in this workspace (`sites-previewd` mailbox missing). The supported workflow does not allow replacing that infrastructure. Browser interaction, responsive rendering, keyboard behavior, and visual accessibility therefore remain unverified interactively. Automated tests do not claim to replace that review.

Hosted authentication, the final hosted D1/R2 resources, and cross-device behavior rely on the Sites platform. API-handler tests exercise application identity and permissions with trusted test identity headers; they do not constitute an end-to-end login test against the hosted platform.

## Business assumptions for Fuji's review

The precise $150 boundary, the middle-tier conjunction, sequential sign-off, cost-inclusive routing, and the one-day emergency deadline are documented in `requirements.md` and exposed in the app's Purchasing policy page. The supplied written procedure is from 2012; its continued applicability is assumed for this course implementation because Chase supplied it as the reference.
