# Backups, recovery and independent monitoring

## App runtime keys

Configure these as secrets through the hosting platform. They must never appear in source or the browser bundle:

- `FUJI_MFA_KEY`: 32 random bytes encoded as 64 hex characters, for AES-GCM protection of authenticator secrets.
- `FUJI_BACKUP_KEY`: an independent 32-byte hex key for HMAC signatures on backup manifests.
- `FUJI_OPERATIONS_TOKEN`: a random service token of at least 32 characters, shared only with the independent monitor.

Local `pnpm dev` creates missing development keys in ignored `.dev.vars`. Hosted keys are configured independently. Preserve the MFA and backup keys in secure operational custody. Replacing them without a migration makes existing factors or signed backups unreadable. Business-record restoration intentionally does not overwrite keys, sessions, factors or existing member permissions.

## Manual backup and restore

1. Sign in and complete MFA as the workspace owner.
2. Open Workspace tools and choose Create backup now.
3. Wait for Complete, then use Verify to check every part and attachment checksum without replacing current purchases.
4. To restore, select a completed snapshot and enter its exact confirmation text.
5. During restoration, purchase mutations return a temporary unavailable response. Reads continue. Progress persists between steps.
6. Completion atomically swaps purchasing records and attachment metadata, advances versions and rebuilds the register index. Existing audit entries remain append-only. A safety snapshot preserves the records present at restoration start.

Attachments restore into new private object keys, so a failed verification cannot overwrite a currently referenced file. Missing member-directory records return inactive. The owner must explicitly review and save access before these identities can sign in. Existing member roles are preserved.

If the D1 backup catalog is lost but R2 and the runtime signing key survive, apply the schema, establish the private workspace owner, enroll MFA and choose Find stored backups. The app verifies signed R2 manifests before rebuilding catalog entries. The same backup key is required. Full loss of both D1 and R2 is outside a same-bucket backup's failure boundary; an independent protected storage/account copy or provider disaster recovery is needed for that scenario.

Run a representative restoration drill at least monthly, ideally on an isolated environment restored from protected copies. Record completion time and compare with the 30-minute RTO. Verification is useful, but it is not a substitute for the full drill.

## Independent operations Worker

`operations/worker.ts` runs independently so it can send an outage alert even when the main app cannot respond. Its one-minute Cron performs an HTTPS health probe, stores minute measurements, retries pending observations, triggers/resumes backup work and sends pending failure alerts. Backup steps process staged rows/files in bounded batches. New snapshots start hourly, with five-minute retry spacing after failure. Completed snapshots retain 30 days.

The source includes a configuration example. Deployment requires an operating Cloudflare account and alert destination; those services are not implicitly activated by publishing the purchasing Site.

1. Copy `operations/wrangler.example.jsonc` to ignored `operations/wrangler.jsonc`.
2. Create a Workers KV namespace named for operations and set its ID as the `STATE` binding.
3. Set `APP_ORIGIN` to the isolated version's HTTPS origin.
4. Set Worker secret `APP_OPERATIONS_TOKEN` to the app's `FUJI_OPERATIONS_TOKEN`. If establishing a new shared value, update only that service token on both sides; preserve the MFA and backup keys.
5. For an owner-private Site, configure `SITE_ACCESS_TOKEN` using supported Sites service access. It is distinct from the app service token and supplies no user identity.
6. Set Worker secret `ALERT_WEBHOOK_URL` to an HTTPS support receiver accepting JSON with `text`, `eventId`, `occurredAt` and `app`. The receiver must acknowledge accepted alerts with a 2xx response.
7. Deploy the Worker with the example's `* * * * *` Cron, using the operating account's Wrangler configuration.
8. Exercise a health check and operations callback before relying on the schedule. Workspace tools should show Connected, a recent service check and a completed backup.
9. Simulate a failed health check and failed backup; verify receipt at the actual support destination within five minutes. Also test a recovery code, idle expiry, restore drill and monitoring coverage.

Example Wrangler commands, run after the operating account is authenticated:

```sh
pnpm exec wrangler kv namespace create FUJI_OPERATIONS
pnpm exec wrangler secret put APP_OPERATIONS_TOKEN --config operations/wrangler.jsonc
pnpm exec wrangler secret put SITE_ACCESS_TOKEN --config operations/wrangler.jsonc
pnpm exec wrangler secret put ALERT_WEBHOOK_URL --config operations/wrangler.jsonc
pnpm exec wrangler deploy --config operations/wrangler.jsonc
```

Worker checks use 10-second probe/delivery timeouts and do not follow redirects with credentials. Failed alert deliveries retry on later minutes. Accepted event IDs prevent routine duplicate deliveries, subject to KV consistency. Pending observations survive app outages for seven days. A failed service callback keeps them queued.

## Measurements and boundaries

- Monthly observed availability is healthy recorded checks divided by recorded checks. Coverage reports missing measurements separately; incomplete coverage must not be presented as a verified SLA.
- Monitor scheduling/hosting failures can leave gaps. An additional external uptime service may be appropriate for monitoring the monitor itself.
- One-hour RPO and 30-minute RTO are operating targets. Measure snapshot completion, attachment volume, quota/plan headroom and real restoration duration. Code alone does not establish them.
- Native D1/R2 encryption protects hosted backup objects at rest. Protect any copies moved outside those services independently.

Provider references: https://developers.cloudflare.com/workers/configuration/cron-triggers/ , https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ , https://developers.cloudflare.com/d1/worker-api/d1-database/ , https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ .
