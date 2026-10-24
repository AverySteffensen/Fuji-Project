# Purchasing information protection (NFR09)

## Connections

The hosted app requires HTTPS. Its request middleware checks the actual URL before
calling the application handler. It redirects HTTP GET/HEAD requests to the same
HTTPS URL and rejects HTTP writes and uploads before authentication, database
access or file handling. Client-supplied forwarding headers cannot bypass this
check. Development previews can use HTTP only in the development build.

HTTPS responses carry `Strict-Transport-Security: max-age=31536000` for the Site's
own hostname. A Content Security Policy upgrades insecure resource requests.
Purchasing pages, React streams, API data and attachment downloads carry
`Cache-Control: private, no-store`. Authentication, membership and record-level
permission checks continue to protect access. The hosting platform still owns
TLS certificates, its edge configuration and sign-in routes.

## Hosted storage

The tracked hosting manifest binds purchasing records to Cloudflare D1 (`DB`)
and uploaded files to private Cloudflare R2 (`BUCKET`). Files pass through the
authorized attachment route and do not receive public object URLs.

Cloudflare documents automatic AES-256 encryption at rest for all D1 and R2
objects, including their metadata, with provider-managed keys. This protection
does not require a user-operated encryption switch. Cloudflare also documents
TLS protection for transfers to these services. This is platform-managed storage
encryption, rather than an extra application encryption layer or a claim that
the hosting provider cannot decrypt records.

Provider references, checked October 23, 2026:

- https://developers.cloudflare.com/d1/reference/data-security/
- https://developers.cloudflare.com/r2/reference/data-security/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/upgrade-insecure-requests

## Backup and export boundaries

NFR06's scheduled backups, separate attachment copies, retention and timed
restore process remain proposed capabilities. This change does not create or
validate those backups. Future backup copies must use encrypted protected
storage and HTTPS transfers to complete NFR09's backup requirement.

An Excel workbook downloaded to an employee's computer leaves the hosted storage
boundary. Fuji's device and file-storage policies govern encryption of that
downloaded copy. HTTPS and storage encryption complement access control and MFA.

## Verification

`tests/security.test.ts` verifies the middleware entry and that insecure requests never reach application
handlers, secure response bodies and download headers survive, sensitive
responses cannot use shared caches, existing CSP and cookies are preserved and
development previews continue to work. Hosting-provider encryption is supported
by the documented guarantees above, not by inspecting provider encryption keys.
