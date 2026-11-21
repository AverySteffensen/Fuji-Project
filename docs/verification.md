# Verification record

Verified in the authoring environment on October 23, 2026 (Eastern).

- 63 automated checks passed, including the original business/API/HTTPS regressions.
- TypeScript checks passed.
- Production build compiled the register/export, security/session/MFA, backup/restore, health and service routes.
- The current benchmark uses 3,600 records and four concurrent signed-in members. It measures search/filter p95 and the duration of a 1,000-request export through the API handlers with a local SQLite D1 adapter. The November 6 run measured 21 ms search/filter p95 and 331 ms for a 1,000-request XLSX export.
- Role-by-role query comparisons verify the server index preserves record access, approval queues, combined filters and sort order.
- Recovery tests create a snapshot with an attachment, change purchasing records, restore the snapshot, retrieve the restored file, retain later audit events and reject stale versions.
- Damage tests reject corrupted parts and altered signed manifests. Signed manifest discovery recovers missing database catalog metadata.
- Access tests cover standard hosted identity, continued access with a valid provider session after an obsolete app lease, explicit loss of provider identity, inactive membership and owner-only backup access.
- Monitor tests simulate an app outage independently, a failed notification delivery, retry and deduplication.

The managed browser preview daemon is unavailable. The register's live browser interactions and real-user MFA enrollment remain unverified in this environment. Hosted latency, actual RPO/RTO, five-minute receipt at the real alert destination and monthly availability require operating-account setup and measurements. The independent operations Worker and alert receiver have not been activated by these local tests.

The original GitHub branches were inspected at task start. The GitHub connection rejected creation of a new branch with HTTP 403 Resource not accessible by integration. The Codespaces update bundle creates requirements-completion from the verified spreadsheet-interface baseline without changing either existing branch.
