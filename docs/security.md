# Purchasing information protection

## Identity and access

Sites verifies visitors and controls who may open the hosted register. Purchasing endpoints check active membership, the required role and access to the requested record. The owner may switch to a sample employee or approver for training. The server restricts those personas to sample records.

Accounting can leave the app open while its hosted identity remains valid. **Sign out** ends the hosted session on a shared workstation. The app uses the provider’s session directly. Older app-session and authenticator tables remain for migration compatibility.

## Purchasing data

The production middleware redirects HTTP reads to HTTPS, rejects insecure writes and sets HSTS on protected HTTPS routes. Purchasing pages, APIs and private downloads set a no-store cache policy. Attachment downloads also check access to the purchase, set a download filename and disable browser content-type sniffing.

D1 stores the purchase, register index and audit updates in one transaction. Database triggers block edits to retained audit records. Restoring a purchase logs the change and advances its version so an older open form cannot overwrite it. Current member roles and permissions remain authoritative.

## Backup access

The daily service uses the Site’s private access credential and a separate proof restricted to the daily backup endpoint. That endpoint returns status, a snapshot ID and expiry. Downloading the archive requires a signed-in owner. Verifying a stored snapshot checks its signed manifest, component checksums and attachment bytes. An owner can then download an authenticated AES-GCM encrypted archive for storage on Fuji’s servers. Keep the original backup key in a separate operational secret store. The [operations guide](operations.md) covers key management and recovery.

The independent uptime monitor uses separate service authorization. Its configuration and support alert destination are distinct from the daily backup schedule.

## Verification

Tests cover sign-in, active membership, role and record access, HTTPS handling, cross-origin purchasing writes, conflicting updates, retained history, backup integrity, owner-only downloads and restoration. The [verification record](verification.md) identifies hosted checks and remaining operating targets. A review of provider-managed storage settings and a full-shift test on a Fuji workstation remain open.


## Role management and View As

| Access-management level | Roles at that level |
| --- | --- |
| 5 | Workspace owner |
| 4 | Vice President |
| 3 | Controller, Plant Manager, Treasurer |
| 2 | Supervisor |
| 1 | Employee, Accounting |

The levels govern member administration and preview eligibility. Purchasing actions still require the operational role for the action. A person with several roles receives their combined purchasing permissions. The owner adds members after granting Site access. To edit roles, both the member’s highest existing role and every proposed role must be strictly below the editor’s highest role. The owner and built-in sample accounts are protected. Each membership change records the signed-in editor and the role sets in the security history.

All supervisors cover all departments, including supervisors originally set up for one department. View As opens an active lower-level individual’s perspective. Registers, detail, attachments and Excel exports use that person’s record access. The server rejects purchasing, attachment, membership and owner-operation changes in that mode. The owner’s separate Workspace role control continues to support hands-on practice using built-in sample personas.
