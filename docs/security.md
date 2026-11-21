# Purchasing information protection

## Identity and access

Sites handles sign-in and audience controls. Each purchasing API checks verified identity, active membership and record scope. The workspace owner can switch to demo personas that are restricted to sample records. Accounting can keep the app open while the hosted session remains valid. Use **Sign out** to end the hosted session on a shared workstation.

The client’s internal tracking policy uses the provider session directly. The former app-session and authenticator tables remain in the migration history for compatibility.

## Transport, storage and history

Production middleware redirects HTTP reads and rejects insecure writes. HTTPS responses carry HSTS. Purchasing pages, private downloads and APIs send no-store policies. Server-side attachment checks restrict file access to users authorized for the associated request.

Hosted D1 and R2 protect persisted data. Downloaded backup archives use authenticated AES-GCM encryption. Signed manifests and checksums verify stored backups, including the private attachment copies. Keep the original backup key separately in an operational secret store. See [operations](operations.md).

Purchase, index and audit writes are atomic. Database triggers protect retained audit history. Restoration logs business record changes and increments versions so stale clients cannot overwrite the restored state. Current membership and permissions remain authoritative during restoration.

## Verification

The API suite checks sign-in and membership, scoped access, HTTPS, cross-origin writes, atomic concurrency, immutable history, backup integrity, authorization for portable downloads and recovery. Hosted session behavior depends on Sites. Review access and storage with Fuji’s IT owner before handling production records.
