import { BusinessError } from "./domain.ts";
import { pruneBackups, runStep, startBackup } from "./operations.ts";
type Check = { at: string; ok: boolean; duration: number; message?: string };
export async function recordChecks(db: D1Database, checks: Check[]) {
  const now = Date.now();
  const valid = checks.filter(
    (c) =>
      /^\d{4}-\d{2}-\d{2}T/.test(c.at) &&
      Math.abs(Date.parse(c.at) - now) <= 7 * 86400000 &&
      Number.isFinite(c.duration),
  );
  if (valid.length)
    await db.batch(
      valid
        .slice(0, 180)
        .map((c) =>
          db
            .prepare(
              "INSERT OR IGNORE INTO health_checks(id,at,ok,duration,message) VALUES (?,?,?,?,?)",
            )
            .bind(
              c.at.slice(0, 16),
              c.at,
              c.ok ? 1 : 0,
              Math.max(0, Math.min(120_000, Math.round(c.duration))),
              String(c.message ?? "").slice(0, 300),
            ),
        ),
    );
  await db
    .prepare("DELETE FROM health_checks WHERE at<?")
    .bind(new Date(now - 45 * 86400000).toISOString())
    .run();
  const earliest = valid.map((c) => c.at).sort()[0];
  if (earliest)
    await db
      .prepare(
        "INSERT OR IGNORE INTO app_settings(key,value) VALUES ('monitoring-start',?)",
      )
      .bind(earliest)
      .run();
  await db
    .prepare(
      "INSERT OR REPLACE INTO app_settings(key,value) VALUES ('last-operations-tick',?)",
    )
    .bind(new Date().toISOString())
    .run();
}
export async function recordFailureAlerts(db: D1Database) {
  const failures = await db
    .prepare(
      "SELECT id,at,data FROM backup_runs WHERE status='failed' ORDER BY at DESC LIMIT 50",
    )
    .all<{ id: string; at: string; data: string }>();
  if (failures.results.length)
    await db.batch(
      failures.results.map((run) => {
        const details = JSON.parse(run.data);
        return db
          .prepare(
            "INSERT OR IGNORE INTO operation_alerts(id,kind,at,data) VALUES (?,'backup-or-restore-failed',?,?)",
          )
          .bind(
            `operation-failed:${run.id}`,
            run.at,
            JSON.stringify({
              runId: run.id,
              message: details.error || "A backup or restoration failed.",
            }),
          );
      }),
    );
  const latest = await db
    .prepare(
      "SELECT at FROM backup_runs WHERE status='complete' AND json_extract(data,'$.kind')='backup' ORDER BY at DESC LIMIT 1",
    )
    .first<{ at: string }>();
  if (latest && Date.now() - Date.parse(latest.at) > 65 * 60_000) {
    const hour = new Date().toISOString().slice(0, 13);
    await db
      .prepare(
        "INSERT OR IGNORE INTO operation_alerts(id,kind,at,data) VALUES (?,'backup-overdue',?,?)",
      )
      .bind(
        `backup-overdue:${hour}`,
        new Date().toISOString(),
        JSON.stringify({
          message: "No completed backup is available from the past 65 minutes.",
        }),
      )
      .run();
  }
}
export async function operationsTick(
  db: D1Database,
  bucket: R2Bucket,
  checks: Check[],
) {
  await recordChecks(db, checks);
  const active = await db
    .prepare(
      "SELECT id FROM backup_runs WHERE status='working' ORDER BY CASE WHEN json_extract(data,'$.kind')='restore' THEN 0 ELSE 1 END,at LIMIT 1",
    )
    .first<{ id: string }>();
  if (active) {
    try {
      await runStep(db, bucket, active.id);
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
    }
  } else {
    const latest = await db
      .prepare(
        "SELECT at,status FROM backup_runs WHERE json_extract(data,'$.kind')='backup' ORDER BY at DESC LIMIT 1",
      )
      .first<{ at: string; status: string }>();
    if (
      !latest ||
      Date.now() - Date.parse(latest.at) >=
        (latest.status === "failed" ? 5 : 60) * 60_000
    ) {
      const id = await startBackup(db, "scheduled-operations");
      await runStep(db, bucket, id);
    }
  }
  await pruneBackups(db, bucket);
  await recordFailureAlerts(db);
  const pending = await db
    .prepare(
      "SELECT id,kind,at,data FROM operation_alerts WHERE delivered_at IS NULL ORDER BY at LIMIT 20",
    )
    .all();
  return { alerts: pending.results };
}
export async function operationsSummary(db: D1Database) {
  const runs = await db
    .prepare(
      "SELECT id,at,status,data FROM backup_runs ORDER BY at DESC LIMIT 100",
    )
    .all<{ id: string; at: string; status: string; data: string }>();
  const month = new Date().toISOString().slice(0, 7) + "-01T00:00:00.000Z";
  const health = await db
    .prepare(
      "SELECT COUNT(*) AS checks,COALESCE(SUM(ok),0) AS healthy,MAX(at) AS lastCheck FROM health_checks WHERE at>=?",
    )
    .bind(month)
    .first<{ checks: number; healthy: number; lastCheck: string | null }>();
  const start = await db
    .prepare("SELECT value FROM app_settings WHERE key='monitoring-start'")
    .first<{ value: string }>();
  const lastTick = await db
    .prepare("SELECT value FROM app_settings WHERE key='last-operations-tick'")
    .first<{ value: string }>();
  const alerts = await db
    .prepare(
      "SELECT id,kind,at,delivered_at,data FROM operation_alerts ORDER BY at DESC LIMIT 30",
    )
    .all();
  const from = Math.max(
    Date.parse(month),
    start ? Date.parse(start.value) : Date.now(),
  );
  const expected = Math.max(1, Math.floor((Date.now() - from) / 60_000) + 1);
  return {
    runs: runs.results.map((run) => {
      const data = JSON.parse(run.data);
      return {
        id: run.id,
        at: run.at,
        status: run.status,
        kind: data.kind,
        phase: data.phase,
        expiresAt: data.expiresAt,
        sourceId: data.sourceId,
        error: data.error,
      };
    }),
    health: {
      ...health,
      availability: health?.checks
        ? (100 * health.healthy) / health.checks
        : null,
      coverage: health?.checks
        ? Math.min(100, (100 * health.checks) / expected)
        : 0,
      target: 99.9,
    },
    lastTick: lastTick?.value ?? null,
    schedulerActive:
      !!lastTick && Date.now() - Date.parse(lastTick.value) < 3 * 60_000,
    alerts: alerts.results.map((a) => ({
      ...a,
      data: JSON.parse(String(a.data)),
    })),
  };
}
