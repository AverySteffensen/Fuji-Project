# Purchasing information protection

## Platform identity and access

Sites retains primary authentication and private audience enforcement. Every purchasing API also checks current membership, role/department scope and a browser-specific authorization session. Sessions contain a random 256-bit token in a Secure/HttpOnly/SameSite cookie; only its SHA-256 hash lives in D1. The token must match the verified platform user. Demo switching never bypasses the real owner's checks.

The authorization lease expires after 15 minutes without activity. Status polling does not refresh it. The frontend sends throttled activity heartbeats, gives a one-minute warning and clears the lease on logout. At expiration it attempts top-level hosted sign-out and retains the sign-out link if browser embedding restricts automatic navigation. Expired tokens are rejected server-side regardless of browser timers. Primary account/session policies remain platform-managed.

## Multifactor authentication

Every approver, Accounting user and administrator must enroll a TOTP authenticator. The app blocks purchasing endpoints until that session has passed MFA. Each account has an encrypted secret using AES-GCM with a unique IV and account ID as authenticated additional data. A runtime-only key is separate from D1. TOTP uses RFC 6238 with 30-second, six-digit SHA-1 codes. It permits one adjacent time step for clock skew and atomically rejects a previously consumed counter.

Ten random recovery codes appear once on enrollment. Only their hashes persist. Consumption is atomic and single-use. Five failed attempts cause a five-minute block. Security events contain action/user/time, never codes, secrets or tokens. Factors cannot be silently replaced through the enrollment endpoint after enrollment.

Every real privileged user must enroll their own authenticator. Provider-side MFA is not assumed. Recovery after loss of every factor needs a verified administrator process; no ordinary member endpoint bypasses MFA.

## HTTPS and storage

Production middleware redirects HTTP reads and rejects insecure writes before app handlers. Forwarding headers cannot bypass the URL check. HTTPS responses carry HSTS and upgrade-insecure-requests. Purchasing pages, React streams, APIs and private downloads use no-store policies. Development HTTP is limited to the development build.

Cloudflare D1 and private R2 provide automatic AES-256 storage encryption. The app adds application-level encryption for authenticator secrets and HMAC-signed backup manifests. Attachment downloads pass through permission checks and never expose public object URLs. Backup and restored files use private R2 object keys.

Purchase/index/audit updates are atomic. Database triggers reject UPDATE and DELETE on audit/security history. Each purchase event records old and new values. Restoration keeps later audit entries, logs replacement/removal and increments versions so stale clients cannot overwrite the restored state.

## Backup and operational boundaries

Backups now include independent copies of attachment bytes and signed, checksum-protected manifests. Business records can be restored without restoring old MFA factors, sessions or permissions. Missing directory entries are inactive until access is reviewed. Discovery can recover the D1 backup catalog from signed R2 manifests. Keep the backup signing key outside the business backup.

Hourly scheduling, the independent monitoring Worker and the real alert destination need operating-account configuration. Manual backup/verification/restoration work independently of that schedule. Recovery after total loss of both the database and bucket requires an additional failure domain. See [operations](operations.md).

Excel downloads leave the hosted storage boundary. Fuji's device/file policies govern encryption of these copies.

## Verification and references

Automated tests exercise TOTP reference vectors, enrollment gating, replay rejection, recovery consumption, attempt limits, idle expiry, cross-identity cookies, roles, HTTPS, private files, concurrent writes, immutable history, backup restoration and damaged-backup rejection. Hosted enrollment and browser behavior require an authenticated session and an available preview/browser route.

- https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- https://www.rfc-editor.org/rfc/rfc6238
- https://developers.cloudflare.com/d1/reference/data-security/
- https://developers.cloudflare.com/r2/reference/data-security/
