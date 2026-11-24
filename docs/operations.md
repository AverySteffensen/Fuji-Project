# Backups, recovery and monitoring

## Daily backups on the hosted register

The hosted Fuji Purchasing Register has a daily backup scheduled for **3:00 a.m. Eastern**, including weekends. Staff can close the app overnight. On November 21, 2026, the initial run completed, the workspace owner verified the snapshot and the encrypted download reached the browser. Its recorded expiration was December 21, 30 days after capture. See the [release verification record](verification.md).

In **Workspace tools**, select **Refresh status**. **Last daily check-in** shows when the service last checked or advanced the job. **Last successful scheduled snapshot** shows the capture time of the latest completed scheduled backup. Manual backups appear separately in the table. The owner can download a completed snapshot for storage on Fuji’s server.

### How the schedule works

The hosted schedule runs the [daily backup script](../scripts/run-daily-backup.mjs). For each run, the script reads a single JSON line from private standard input. Its fields are `siteUrl` (the Fuji Site’s live URL) and `accessToken` (its current service-access token). Keep credentials out of command arguments, logs and source control.

The script calls `POST /api/operations/daily-backup` and retries temporary failures for up to 20 minutes. If work is interrupted, rerunning the script resumes it. Once a snapshot completes, another call for the same Eastern date returns the existing snapshot. The stored snapshot expires 30 days after capture.

### Runtime keys

Configure these values as runtime secrets on the host.

| Key | Purpose |
| --- | --- |
| `FUJI_BACKUP_KEY` | A 32-byte key encoded as 64 hexadecimal characters. Used to sign manifests and derive archive encryption keys. Keep the original key in a protected secret store separate from downloaded archives. |
| `FUJI_DAILY_BACKUP_VERIFIER` | Verifies the daily runner’s credentials. To initialize it or renew it after a Site service-token rotation, run `node scripts/run-daily-backup.mjs --verifier` with the same private input described above. Store the returned verifier on the Site. |
| `FUJI_OPERATIONS_TOKEN` | A random token of at least 32 characters. The independent uptime monitor uses it to call the app’s operations API. |

For local development, `pnpm dev` creates any missing backup key and operations token in the ignored `.dev.vars` file. The daily-backup verifier is configured separately for the hosted schedule.

## Manual backup, verification and restore

1. Sign in as the workspace owner. Open **Workspace tools** and select **Create backup now**.
2. When the snapshot is complete, select **Verify**. This checks its signed manifest, data parts and attachment checksums while current purchases remain available.
3. To replace the current purchasing records with a snapshot, select **Restore**, type the exact confirmation shown for that snapshot and select **Restore purchasing records**. The app captures a safety snapshot before replacing the records.
4. During the restore, reads continue and purchasing updates are paused. The app verifies the data and copies attachments to new private storage keys, then replaces purchasing records and attachment metadata, advances record versions and rebuilds the register index. Existing audit history is retained.
5. Existing members keep their current permissions. A directory entry recovered for a missing member starts inactive. An authorized manager can open **People & access → Removed members**, select **Re-add** and choose the appropriate roles.

If the D1 backup catalog is lost but R2 and the original signing key survive, apply the database migrations, establish the private workspace owner and select **Find stored backups**. The app verifies the signed manifests in R2 and rebuilds the catalog for unexpired backups. To recover from loss of both stores, use a separately retained archive and its original key.

The team’s 30-minute restore target requires a timed drill. Use an isolated environment and check that a representative request, its audit history and its attachments can all be opened.

## Recover a downloaded archive

1. In **Workspace tools**, select **Download backup** for a completed, unexpired snapshot. Store the `.fujibackup` file on Fuji’s protected server.
2. In an isolated recovery environment using Node 24, supply the original `FUJI_BACKUP_KEY` through the process environment.
3. Run `node --experimental-strip-types scripts/unpack-backup.mjs SNAPSHOT.fujibackup NEW_DIRECTORY`. The destination directory must be new. The utility authenticates the encrypted frames and verifies the signed manifest and component checksums before writing the final directory. Restrict access to the extracted plaintext.
4. To restore an unexpired snapshot through the app, transfer the verified objects to the private recovery bucket using their exact relative keys under `backups/` and `backup-manifests/`. Configure the original backup key on the recovery app, apply its database migrations, then select **Find stored backups**, **Verify** and **Restore**.

## Independent uptime monitor

The [operations Worker](../operations/worker.ts) is a separate deployment with a one-minute schedule. It probes the Site over HTTPS, stores measurements in Workers KV and sends alerts to a support webhook. It can also advance a pending backup. Both services recognize a scheduled snapshot already completed for the same Eastern date. The November 21 backup verification established the daily backup path. Live uptime measurements and alert delivery to a support receiver require separate verification.

To configure the monitor, use the Cloudflare account that will operate it.

1. Copy [the example configuration](../operations/wrangler.example.jsonc) to `operations/wrangler.jsonc`, which Git ignores.
2. Create a Workers KV namespace and put its ID in the `STATE` binding.
3. Set `APP_ORIGIN` to the HTTPS origin of the register you intend to monitor.
4. Set the Worker secret `APP_OPERATIONS_TOKEN` to match the app’s `FUJI_OPERATIONS_TOKEN`. For the private Fuji Site, also set `SITE_ACCESS_TOKEN` to its Site service-access token.
5. Set `ALERT_WEBHOOK_URL` to an HTTPS support receiver. It should accept a JSON payload with `text`, `eventId`, `occurredAt` and `app` and return a 2xx response when accepted.
6. Deploy the Worker with the example’s one-minute Cron schedule. In **Workspace tools**, check the independent monitor’s connection, last check-in and recorded health check.
7. Exercise failed health checks and backup failures in a test environment. Record when the support receiver accepts the alerts and compare that time with the team’s five-minute target.

Run the following commands after authenticating Wrangler to the intended Cloudflare account. Enter the KV namespace ID in the local configuration before deploying.

```sh
pnpm exec wrangler kv namespace create FUJI_OPERATIONS
pnpm exec wrangler secret put APP_OPERATIONS_TOKEN --config operations/wrangler.jsonc
pnpm exec wrangler secret put SITE_ACCESS_TOKEN --config operations/wrangler.jsonc
pnpm exec wrangler secret put ALERT_WEBHOOK_URL --config operations/wrangler.jsonc
pnpm exec wrangler deploy --config operations/wrangler.jsonc
```

The Worker allows 10 seconds for each health probe and webhook call and rejects redirects on credentialed requests. It queues observations for up to seven days during an outage. It retries active outage alerts and unacknowledged backup alerts and records accepted event IDs to limit duplicates.

**Monthly availability** uses the share of recorded checks that were healthy. **Coverage** reports the share of expected checks received during the measurement period. Read both figures together. For operational acceptance, review successive daily snapshots, measure recovery time and check delivery at the actual alert destination.

[Cloudflare Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [Scheduled Worker handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) · [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) · [R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
