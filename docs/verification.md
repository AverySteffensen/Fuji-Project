# V5 verification record

On November 21, 2026, the hosted V5 release and the GitHub release contained the same application source. All 67 automated checks passed locally. GitHub Actions also passed the tests, TypeScript check, benchmark and production build for the [V5 release commit](https://github.com/AverySteffensen/Fuji-Project/commit/8e15f070b91cd998b3886d2c7f88c341933d2480). [View the workflow run](https://github.com/AverySteffensen/Fuji-Project/actions/runs/44944246692).

## Hosted checks

| Area | Observed result |
| --- | --- |
| Register | The owner opened the spreadsheet-style register and saw sortable columns, filters, the overdue indicator and the Excel export control. The November 6 V4 rehearsal had already taken a sample request through rejection, revision, approval, receipt and export. |
| Daily backup | On November 21, the service created a snapshot at 3:02 p.m. Eastern. Its recorded expiry was exactly 30 days later. Repeating the call returned the same completed snapshot. |
| Owner access to the backup | **Verify** completed in the live owner workspace, and **Download backup** delivered the encrypted file to the browser. |
| Schedule | The daily job was enabled for 3 a.m. Eastern. Its first calendar-triggered run was due November 22. The November 21 check exercised the scheduled service directly. |

## Automated and local checks

| Area | Coverage |
| --- | --- |
| Purchasing | Submission and retry handling, approval thresholds and role order, rejection and revision history, emergency orders, withdrawal, receipt and final invoice variance |
| Search and Excel | Role-scoped results, sorting, date ranges, pagination, exports across pages, spreadsheet date and number types, and text that begins with a formula character |
| Sign-in and access | Active membership, request and file permissions, access while a provider session is valid, and loss of access after sign-out |
| Backup and recovery | One scheduled snapshot per Eastern calendar day, including daylight-saving transitions. Tests cover concurrent calls, interrupted work, retries, expiry, damaged archives, signed-manifest verification and restoration using isolated data. |
| Independent monitoring | Simulated app outages, failed alert delivery, retries and duplicate-alert handling |

With 3,600 local records and four concurrent callers, the November 21 benchmark measured **18 ms** for search and filtering at the 95th percentile and **362 ms** to export 1,000 requests. It exercised the application’s API handlers against a local SQLite adapter for D1.

## Remaining hosted checks

A representative restore drill still needs to be timed in an isolated environment. A month of operating history is needed to measure backup retention and availability over that period. Other open checks include hosted performance under load, storage settings, delivery to the real support alert destination, keyboard and small-screen usability, and an idle Accounting session through a full shift. The app uses the hosting provider’s sign-in session. See the [requirements register](requirements.md) and [operations guide](operations.md).

## November 24 access revision

The API regression in `tests/member-access.test.ts` exercises multi-role assignment, legacy supervisor coverage, delegated edits, protected peers, restricted perspectives and blocked changes in View As. Additional membership tests cover permitted and denied additions and removals at each level, binding a returning member to the same sign-in, denial during removal, stale requests and retained purchase history. The original independent learner score belongs to the original training exercise.
