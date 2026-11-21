# Backups, recovery and independent monitoring

## App runtime keys

Configure these as secrets through the hosting platform. They must never appear in source or the browser bundle:

- `FUJI_BACKUP_KEY`: an independent 32-byte hex key for HMAC manifest signatures and encryption key derivation for downloadable snapshots.
- `FUJI_OPERATIONS_TOKEN`: a random service token of at least 32 characters, shared only with the independent monitor.
- `FUJI_DAILY_BACKUP_VERIFIER` authorizes the daily backup endpoint. For initial setup, pass the current Site service-access object to `node scripts/run-daily-backup.mjs --verifier` through private standard input and install the returned verifier in the Site's runtime. If the service token rotates, renew the verifier with the replacement credential. Keep the original `FUJI_BACKUP_KEY` so existing downloads can still be opened.

Local `pnpm dev` creates missing development keys in ignored `.dev.vars`. Hosted keys are configured independently. Keep the original backup key in secure operational custody, separately from the downloaded archives. Existing snapshots require their original key. Restoration preserves current keys and member permissions.

## Daily backups

Set the cloud job to run every day at **3:00 a.m. America/New_York**. For each run, fetch the current Site service-access details and pass a JSON object with `siteUrl` and `accessToken` to `node scripts/run-daily-backup.mjs` through private standard input. Keep credentials out of the schedule text, repository and logs. The runner calls `POST /api/operations/daily-backup` in bounded steps and retries temporary failures within a 20-minute window. After an interruption, rerunning it resumes saved work. The service retains one successful scheduled snapshot per Eastern date for 30 days.

In **Workspace tools**, use **Refresh status** and check the scheduled attempt and the last successful scheduled snapshot. **Daily backup service** records the last call that checked or advanced scheduled work. A check-in can occur before a snapshot finishes. The last successful snapshot shows the capture time of the latest completed scheduled backup. A manual backup appears in the operations table. Downloading a copy to Fuji's servers is a separate owner action.

## Manual backup and restore

1. Sign in as the workspace owner.
2. Open Workspace tools and choose Create backup now.
3. Wait for Complete, then use Verify to check every part and attachment checksum without replacing current purchases.
4. To restore, select a completed snapshot and enter its exact confirmation text.
5. During restoration, purchase mutations return a temporary unavailable response. Reads continue. Progress persists between steps.
6. Completion atomically swaps purchasing records and attachment metadata, advances versions and rebuilds the register index. Existing audit entries remain append-only. A safety snapshot preserves the records present at restoration start.

Attachments restore into new private object keys, so a failed verification cannot overwrite a currently referenced file. Missing member-directory records return inactive. The owner must explicitly review and save access before these identities can sign in. Existing member roles are preserved.

If the D1 backup catalog is lost but R2 and the runtime signing key survive, apply the schema, establish the private workspace owner and choose Find stored backups. The app verifies signed R2 manifests before rebuilding catalog entries. The same backup key is required. Full loss of both D1 and R2 is outside a same-bucket backup's failure boundary; an independent protected storage/account copy or provider disaster recovery is needed for that scenario.

To measure the team's 30-minute recovery target, time a representative restoration in an isolated environment and confirm that a sample request, its history and its attachments can be opened.

## Download and recover an off-site copy

1. In Workspace tools, select **Download backup** on a completed, unexpired snapshot. Store the `.fujibackup` file on Fuji's protected server.
2. Keep the original `FUJI_BACKUP_KEY` separately in the organization's secret store. Supply it securely to Node 24 in an isolated recovery environment.
3. Run `node --experimental-strip-types scripts/unpack-backup.mjs SNAPSHOT.fujibackup NEW_DIRECTORY`. The utility verifies the signed manifest and all frame and component checksums before installing the output directory.
4. To restore an unexpired copy through the app, upload the verified objects to the corresponding private recovery bucket using the exact relative keys under `backups/` and `backup-manifests/`. Configure the original key in the recovery app, run its schema migrations, then use **Find stored backups**, **Verify** and **Restore**.
5. Restrict access to extracted plaintext. Treat the original snapshot timestamp and expiration as part of the signed recovery record.

## Independent operations Worker

`operations/worker.ts` runs independently so it can send an outage alert when the main app cannot respond. Its one-minute Cron probes the Site over HTTPS, stores measurements, retries pending observations and delivers support alerts. When enabled, it can also advance scheduled backup work. The 3 a.m. job recognizes any scheduled snapshot already completed for the same Eastern date.

To enable uptime monitoring and alerts, configure the Worker in an operating Cloudflare account with a support alert destination.

1. Copy `operations/wrangler.example.jsonc` to ignored `operations/wrangler.jsonc`.
2. Create a Workers KV namespace named for operations and set its ID as the `STATE` binding.
3. Set `APP_ORIGIN` to the isolated version's HTTPS origin.
4. Set Worker secret `APP_OPERATIONS_TOKEN` to the app's `FUJI_OPERATIONS_TOKEN`. If establishing a new shared value, update only that service token on both sides; preserve the backup key.
5. For an owner-private Site, configure `SITE_ACCESS_TOKEN` using supported Sites service access. It is distinct from the app service token and supplies no user identity.
6. Set Worker secret `ALERT_WEBHOOK_URL` to an HTTPS support receiver accepting JSON with `text`, `eventId`, `occurredAt` and `app`. The receiver must acknowledge accepted alerts with a 2xx response.
7. Deploy the Worker with the example's `* * * * *` Cron, using the operating account's Wrangler configuration.
8. Exercise a health check and operations callback. In Workspace tools, confirm the independent uptime monitor shows Connected, a recent check-in and a recorded health check.
9. Simulate a failed health check and failed backup in a test environment. Record when the actual support receiver accepts each alert and compare the elapsed time against the team's five-minute target.

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
- Check scheduled results across consecutive Eastern dates, including daylight-saving transitions. Measure actual snapshot coverage, recovery point and restoration duration. The 30-minute recovery target comes from the project team.
- Private hosted storage protects backup objects at rest. Downloaded archives add AES-GCM encryption and authenticated component order.

Provider references: https://developers.cloudflare.com/workers/configuration/cron-triggers/ , https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ , https://developers.cloudflare.com/d1/worker-api/d1-database/ , https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ .
