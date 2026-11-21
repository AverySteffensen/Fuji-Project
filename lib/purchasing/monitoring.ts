import { BusinessError, businessDate } from "./domain.ts";
import {
  BACKUP_INTERVAL_MS,
  pruneBackups,
  runStep,
  startBackup,
} from "./operations.ts";
import { randomToken } from "./crypto.ts";
const RETRY_MS = 5 * 60_000;
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
  if (
    latest &&
    Date.now() - Date.parse(latest.at) > BACKUP_INTERVAL_MS + RETRY_MS
  ) {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare(
        "INSERT OR IGNORE INTO operation_alerts(id,kind,at,data) VALUES (?,'backup-overdue',?,?)",
      )
      .bind(
        `backup-overdue:${day}`,
        new Date().toISOString(),
        JSON.stringify({
          message:
            "Daily backup overdue. The most recent completed snapshot is more than 24 hours old.",
        }),
      )
      .run();
  }
}
type ScheduledRun = {
  id: string;
  at: string;
  status: "working" | "complete" | "failed";
  expiresAt: string;
};
export type DailyBackupStatus = {
  day: string;
  id: string | null;
  expiresAt: string | null;
  status: ScheduledRun["status"];
  retryAfterSeconds?: number;
};

const scheduledRuns = `SELECT id,at,status,json_extract(data,'$.expiresAt') AS expiresAt
  FROM backup_runs WHERE json_extract(data,'$.kind')='backup'
  AND json_extract(data,'$.actorId')='scheduled-operations'`;

export async function runDailyBackup(
  db: D1Database,
  bucket: R2Bucket,
): Promise<DailyBackupStatus> {
  const now = new Date();
  const day = businessDate(now.toISOString());
  const pending: DailyBackupStatus = {
    id: null,
    expiresAt: null,
    day,
    status: "working",
    retryAfterSeconds: 2,
  };
  await db
    .prepare(
      "INSERT OR REPLACE INTO app_settings(key,value) VALUES ('last-daily-backup-check',?)",
    )
    .bind(now.toISOString())
    .run();

  const lease = randomToken(12);
  const key = "daily-backup-start";
  const locked = await db
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(app_settings.value,'$.until')<=?",
    )
    .bind(
      key,
      JSON.stringify({ lease, until: now.getTime() + 60_000 }),
      now.getTime(),
    )
    .run();
  if (!locked.meta.changes) return pending;
  try {
    // Each call handles at most one page of expired objects and one saved work step.
    await pruneBackups(db, bucket);
    const moreExpired = await db
      .prepare(
        "SELECT id FROM backup_runs WHERE json_extract(data,'$.kind')='backup' AND json_extract(data,'$.expiresAt')<? LIMIT 1",
      )
      .bind(now.toISOString())
      .first();
    if (moreExpired) return pending;
    const run = await db
      .prepare(
        `${scheduledRuns}
      ORDER BY CASE WHEN status='working' THEN 0 ELSE 1 END,at DESC LIMIT 1`,
      )
      .first<ScheduledRun>();
    const today = run && businessDate(run.at) === day;
    if (today && run.status === "complete") {
      return { day, id: run.id, status: "complete", expiresAt: run.expiresAt };
    }
    if (today && run.status === "failed") {
      const retryAfterSeconds = Math.ceil(
        (Date.parse(run.at) + RETRY_MS - now.getTime()) / 1000,
      );
      if (retryAfterSeconds > 0)
        return {
          day,
          id: run.id,
          status: "failed",
          expiresAt: run.expiresAt,
          retryAfterSeconds,
        };
    }

    let id: string;
    try {
      id =
        run?.status === "working"
          ? run.id
          : await startBackup(db, "scheduled-operations");
    } catch (error) {
      if (error instanceof BusinessError && error.status === 409)
        return pending;
      throw error;
    }
    try {
      await runStep(db, bucket, id);
    } catch (error) {
      // A concurrent owner can resume the same job. Read the saved outcome below.
      const failed = await db
        .prepare("SELECT status FROM backup_runs WHERE id=?")
        .bind(id)
        .first<{ status: string }>();
      if (
        failed?.status !== "failed" &&
        !(error instanceof BusinessError && error.status === 409)
      )
        throw error;
    }
    const saved = await db
      .prepare(`${scheduledRuns} AND id=?`)
      .bind(id)
      .first<ScheduledRun>();
    if (!saved)
      throw new BusinessError("Scheduled backup state is unavailable.", 503);
    // A resumed run can belong to yesterday. The caller must also capture today.
    if (businessDate(saved.at) !== day) return pending;
    return {
      day,
      id,
      status: saved.status,
      expiresAt: saved.expiresAt,
      ...(saved.status === "failed"
        ? { retryAfterSeconds: RETRY_MS / 1000 }
        : saved.status === "working"
          ? { retryAfterSeconds: 2 }
          : {}),
    };
  } finally {
    await db
      .prepare(
        "DELETE FROM app_settings WHERE key=? AND json_extract(value,'$.lease')=?",
      )
      .bind(key, lease)
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
      "SELECT id FROM backup_runs WHERE status='working' AND NOT (json_extract(data,'$.kind')='backup' AND json_extract(data,'$.actorId')='scheduled-operations') ORDER BY CASE WHEN json_extract(data,'$.kind')='restore' THEN 0 ELSE 1 END,at LIMIT 1",
    )
    .first<{ id: string }>();
  if (active) {
    try {
      await runStep(db, bucket, active.id);
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
    }
    await pruneBackups(db, bucket);
  } else {
    await runDailyBackup(db, bucket);
  }
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
  const dailyCheck = await db
    .prepare(
      "SELECT value FROM app_settings WHERE key='last-daily-backup-check'",
    )
    .first<{ value: string }>();
  const daily = await db
    .prepare(`${scheduledRuns} ORDER BY at DESC LIMIT 1`)
    .first<ScheduledRun>();
  const completedDaily = await db
    .prepare(`${scheduledRuns} AND status='complete' ORDER BY at DESC LIMIT 1`)
    .first<ScheduledRun>();
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
    lastDailyBackupCheck: dailyCheck?.value ?? null,
    latestDailyBackup: daily ? { ...daily, day: businessDate(daily.at) } : null,
    lastCompletedDailyBackupAt: completedDaily?.at ?? null,
    dailyBackupActive:
      !!dailyCheck &&
      Date.now() - Date.parse(dailyCheck.value) < 26 * 60 * 60_000,
    lastTick: lastTick?.value ?? null,
    schedulerActive:
      !!lastTick && Date.now() - Date.parse(lastTick.value) < 3 * 60_000,
    alerts: alerts.results.map((a) => ({
      ...a,
      data: JSON.parse(String(a.data)),
    })),
  };
}
