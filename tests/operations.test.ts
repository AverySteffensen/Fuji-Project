import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unpackBackup } from "../scripts/unpack-backup.mjs";
const h = await createHarness();
const { req, read, routes, sql, objects } = h;
const operations = await import("../lib/purchasing/operations.ts");
const monitoring = await import("../lib/purchasing/monitoring.ts");
const monitorWorker = await import("../operations/worker.ts");
const input = {
  department: "Packaging (90)",
  purchaseType: "Facilities",
  priority: "Medium",
  neededBy: "2026-12-01",
  supplier: "Backup Supplier",
  explanation: "Backup integration test",
  items: [
    {
      description: "Backup test item",
      partNumber: "BACKUP-1",
      quantity: 1,
      unitPrice: 100,
    },
  ],
};
let proposal: any,
  fileId = "",
  backupId = "";
const post = async (input: any) =>
  read(await routes.operations.POST(req("POST", "", input)));
async function complete(id: string) {
  for (let i = 0; i < 100; i++) {
    await operations.runStep(h.env.DB as any, h.env.BUCKET as any, id);
    const run = sql
      .prepare("SELECT * FROM backup_runs WHERE id=?")
      .get(id) as any;
    if (run.status !== "working") return run;
  }
  throw new Error("Operation did not finish");
}
test("backup snapshots include consistent records, audit and private file bytes while later purchasing continues", async () => {
  await h.identity();
  proposal = (await read(await routes.create.POST(req("POST", "", input))))
    .data;
  const form = new FormData();
  form.append(
    "file",
    new File(["original quote"], "quote.txt", { type: "text/plain" }),
  );
  const upload = await read(
    await routes.attachment.POST(
      new Request("https://test.local/api", {
        method: "POST",
        headers: {
          Origin: "https://test.local",
        },
        body: form,
      }),
      { params: Promise.resolve({ id: proposal.id }) },
    ),
  );
  assert.equal(upload.status, 201);
  fileId = upload.data.id;
  proposal = (
    await read(
      await routes.update.GET(req(), {
        params: Promise.resolve({ id: proposal.id }),
      }),
    )
  ).data.purchase;
  backupId = (await post({ action: "backup" })).data.id;
  const withdrawal = await read(
    await routes.update.PATCH(
      req("PATCH", "", {
        action: "withdraw",
        version: proposal.version,
        note: "Changed after snapshot",
      }),
      { params: Promise.resolve({ id: proposal.id }) },
    ),
  );
  assert.equal(withdrawal.status, 200);
  assert.equal((await complete(backupId)).status, "complete");
  assert.ok(objects.has(operations.manifestKey(backupId)));
  const copied = objects.get(`backups/${backupId}/files/${fileId}`)!;
  assert.equal(new TextDecoder().decode(copied.body), "original quote");
  assert.equal(
    (
      sql
        .prepare("SELECT COUNT(*) AS n FROM backup_rows WHERE run_id=?")
        .get(backupId) as any
    ).n,
    0,
  );
  const checked = (await post({ action: "verify", id: backupId })).data.id;
  assert.equal((await complete(checked)).status, "complete");
  assert.equal(
    JSON.parse(
      (
        sql
          .prepare("SELECT data FROM purchase_requests WHERE id=?")
          .get(proposal.id) as any
      ).data,
    ).status,
    "Withdrawn",
  );
});
test("owner downloads an encrypted portable snapshot with its private attachment", async () => {
  const path = `/api/operations?download=${backupId}`;
  assert.equal((await routes.operations.GET(req("GET", "demo-accounting", undefined, path))).status, 403);
  const response = await routes.operations.GET(req("GET", "", undefined, path));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition") || "", /attachment.*\.fujibackup/);
  const archive = Buffer.from(await response.arrayBuffer());
  assert.ok(!archive.includes("original quote"));
  assert.ok(!archive.includes("Backup Supplier"));
  const dir = await mkdtemp(join(tmpdir(), "fuji-archive-"));
  try {
    const inputPath = join(dir, "snapshot.fujibackup");
    await writeFile(inputPath, archive);
    const recovered = join(dir, "verified");
    const result = await unpackBackup(inputPath, recovered, h.env.FUJI_BACKUP_KEY);
    assert.equal(result.id, backupId);
    assert.equal(await readFile(join(recovered, "backups", backupId, "files", fileId), "utf8"), "original quote");
    const manifest = await readFile(join(recovered, operations.manifestKey(backupId)), "utf8");
    assert.equal(manifest, new TextDecoder().decode(objects.get(operations.manifestKey(backupId))!.body));
    await assert.rejects(() => unpackBackup(inputPath, join(dir, "wrong-key"), "f".repeat(64)));
    await writeFile(inputPath, archive.subarray(0, archive.length - 2));
    await assert.rejects(() => unpackBackup(inputPath, join(dir, "partial"), h.env.FUJI_BACKUP_KEY), /incomplete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restoration is atomic, restores attachment bytes, retains audit history and invalidates stale versions", async () => {
  const subsequent = (
    await read(await routes.create.POST(req("POST", "", input)))
  ).data;
  assert.equal(
    (await post({ action: "restore", id: backupId, confirm: "wrong" })).status,
    400,
  );
  const started = await post({
    action: "restore",
    id: backupId,
    confirm: `RESTORE ${backupId}`,
  });
  assert.equal(started.status, 201);
  assert.equal((await routes.create.POST(req("POST", "", input))).status, 503);
  assert.equal((await complete(started.data.id)).status, "complete");
  const restored = (
    await read(
      await routes.update.GET(req(), {
        params: Promise.resolve({ id: proposal.id }),
      }),
    )
  ).data;
  assert.equal(restored.purchase.status, "Pending");
  assert.ok(restored.purchase.version > proposal.version + 1);
  assert.equal(
    (
      await routes.update.GET(req(), {
        params: Promise.resolve({ id: subsequent.id }),
      })
    ).status,
    404,
  );
  assert.ok(restored.audit.some((a: any) => a.action === "Withdrawn"));
  assert.ok(
    restored.audit.some((a: any) => a.action === "Restored from backup"),
  );
  const downloaded = await routes.attachment.GET(req(), {
    params: Promise.resolve({ id: fileId }),
  });
  assert.equal(await downloaded.text(), "original quote");
  const storage = sql
    .prepare("SELECT storage_key FROM attachments WHERE id=?")
    .get(fileId) as any;
  assert.match(storage.storage_key, /^restored\//);
  const stale = await routes.update.PATCH(
    req("PATCH", "", { action: "withdraw", version: proposal.version }),
    { params: Promise.resolve({ id: proposal.id }) },
  );
  assert.equal(stale.status, 409);
  const check = await read(await routes.register.GET(req()));
  assert.equal(check.data.total, 65);
});
test("a damaged backup fails closed, preserves current records and releases its restoration lock", async () => {
  const original = (
    sql
      .prepare("SELECT data FROM purchase_requests WHERE id=?")
      .get(proposal.id) as any
  ).data;
  const metadata = JSON.parse(
    (
      sql
        .prepare("SELECT data FROM backup_runs WHERE id=?")
        .get(backupId) as any
    ).data,
  );
  const part = metadata.parts[0].key;
  const saved = objects.get(part)!;
  objects.set(part, {
    ...saved,
    body: new TextEncoder().encode("corrupt").buffer,
  });
  const started = await post({
    action: "restore",
    id: backupId,
    confirm: `RESTORE ${backupId}`,
  });
  await assert.rejects(
    () =>
      operations.runStep(h.env.DB as any, h.env.BUCKET as any, started.data.id),
    /checksum/,
  );
  assert.equal(
    (
      sql
        .prepare("SELECT data FROM purchase_requests WHERE id=?")
        .get(proposal.id) as any
    ).data,
    original,
  );
  assert.equal(
    sql
      .prepare("SELECT value FROM app_settings WHERE key='restore-lock'")
      .get(),
    undefined,
  );
  objects.set(part, saved);
  await monitoring.recordFailureAlerts(h.env.DB as any);
  assert.ok(
    (sql.prepare("SELECT COUNT(*) AS n FROM operation_alerts").get() as any).n >
      0,
  );
});
test("retention prunes expired backup objects and metadata and owner/service permissions are enforced", async () => {
  const old = "expired-test";
  sql
    .prepare(
      "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'complete',?)",
    )
    .run(
      old,
      "2020-01-01T00:00:00Z",
      JSON.stringify({ kind: "backup", expiresAt: "2020-02-01T00:00:00Z" }),
    );
  await h.env.BUCKET.put(`backups/${old}/manifest.json`, "{}", {});
  await operations.pruneBackups(h.env.DB as any, h.env.BUCKET as any);
  assert.equal(objects.has(`backups/${old}/manifest.json`), false);
  assert.equal(
    sql.prepare("SELECT id FROM backup_runs WHERE id=?").get(old),
    undefined,
  );
  assert.equal(
    (await routes.operations.GET(req("GET", "demo-accounting"))).status,
    403,
  );
  assert.equal(
    (await routes.tick.POST(req("POST", "", { action: "tick", checks: [] })))
      .status,
    403,
  );
  const tick = req("POST", "", {
    action: "tick",
    checks: [{ at: new Date().toISOString(), ok: true, duration: 10 }],
  });
  tick.headers.set("Authorization", `Bearer ${h.env.FUJI_OPERATIONS_TOKEN}`);
  assert.equal((await routes.tick.POST(tick)).status, 200);
  const summary = (await read(await routes.operations.GET(req()))).data;
  assert.equal(summary.schedulerActive, true);
  assert.equal(summary.health.availability, 100);
  assert.equal((await routes.health.GET()).status, 200);
});
test("signed R2 manifests recover the backup catalog after database metadata loss and reject tampering", async () => {
  const stored = (
    sql.prepare("SELECT data FROM backup_runs WHERE id=?").get(backupId) as any
  ).data;
  sql.prepare("DELETE FROM backup_runs WHERE id=?").run(backupId);
  const found = await operations.discoverBackups(
    h.env.DB as any,
    h.env.BUCKET as any,
  );
  assert.ok(found.found >= 1);
  assert.equal(
    (
      sql
        .prepare("SELECT status FROM backup_runs WHERE id=?")
        .get(backupId) as any
    ).status,
    "complete",
  );
  const key = operations.manifestKey(backupId),
    original = objects.get(key)!;
  const document = JSON.parse(new TextDecoder().decode(original.body));
  document.payload = document.payload.replace('"format":1', '"format":2');
  objects.set(key, {
    ...original,
    body: new TextEncoder().encode(JSON.stringify(document)).buffer,
  });
  sql.prepare("DELETE FROM backup_runs WHERE id=?").run(backupId);
  await assert.rejects(
    () =>
      operations.startRestore(h.env.DB as any, h.env.BUCKET as any, backupId, {
        id: "owner-1",
        name: "Owner",
      }),
    /signature/,
  );
  objects.set(key, original);
  sql
    .prepare(
      "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'complete',?)",
    )
    .run(backupId, JSON.parse(stored).at || new Date().toISOString(), stored);
});
test("independent monitoring alerts during an app outage, retries delivery and does not duplicate delivered alerts", async () => {
  const state = new Map<string, string>();
  const deliveries: string[] = [];
  const kv = {
    get: async (key: string) => state.get(key) ?? null,
    put: async (key: string, value: string) => {
      state.set(key, value);
    },
    delete: async (key: string) => {
      state.delete(key);
    },
    list: async ({ prefix }: any) => ({
      keys: [...state.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name })),
    }),
  };
  let healthy = false,
    deliveryWorks = false;
  const env = {
    APP_ORIGIN: "https://purchasing.example.test",
    APP_OPERATIONS_TOKEN: "fake-service-token",
    ALERT_WEBHOOK_URL: "https://alerts.example.test/incoming",
    STATE: kv as any,
  };
  const fetcher = async (input: any, init?: any) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/health")
      return Response.json(
        { status: healthy ? "ok" : "unavailable" },
        { status: healthy ? 200 : 503 },
      );
    if (url.hostname === "alerts.example.test") {
      if (deliveryWorks) deliveries.push(JSON.parse(init.body).eventId);
      return new Response("", { status: deliveryWorks ? 200 : 503 });
    }
    return Response.json({ alerts: [] });
  };
  await monitorWorker.monitor(env, fetcher as typeof fetch);
  assert.equal(deliveries.length, 0);
  deliveryWorks = true;
  await monitorWorker.monitor(env, fetcher as typeof fetch);
  assert.equal(deliveries.length, 1);
  await monitorWorker.monitor(env, fetcher as typeof fetch);
  assert.equal(deliveries.length, 1);
  healthy = true;
  await monitorWorker.monitor(env, fetcher as typeof fetch);
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries[0].startsWith("outage:"));
  assert.ok(deliveries[1].startsWith("recovered:"));
});

test("one daily snapshot follows the Eastern date across DST and overlapping schedulers", async (t) => {
  // Both 01:10 times on Nov 1 are the same local calendar day.
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-01T03:30:00Z"),
  });
  const daily = await createHarness();
  await daily.identity();
  const db = daily.env.DB as unknown as D1Database;
  const bucket = daily.env.BUCKET as unknown as R2Bucket;
  const manual = await operations.startBackup(db, "owner-1");
  await operations.runStep(db, bucket, manual);
  const first = await monitoring.runDailyBackup(db, bucket);
  assert.equal(first.status, "complete");
  assert.equal(first.day, "2026-10-31");
  assert.notEqual(first.id, manual);
  assert.equal(
    Date.parse(first.expiresAt!) - Date.now(),
    30 * operations.BACKUP_INTERVAL_MS,
  );
  const summary = await monitoring.operationsSummary(db);
  assert.equal(summary.latestDailyBackup?.id, first.id);
  assert.equal(summary.lastCompletedDailyBackupAt, new Date().toISOString());
  assert.equal(summary.lastDailyBackupCheck, new Date().toISOString());
  assert.equal(summary.dailyBackupActive, true);
  assert.equal(summary.schedulerActive, false);
  assert.equal(summary.lastTick, null);
  assert.equal(summary.health.checks, 0);

  t.mock.timers.setTime(Date.parse("2026-11-01T05:10:00Z"));
  await Promise.all([
    monitoring.runDailyBackup(db, bucket),
    monitoring.runDailyBackup(db, bucket),
    monitoring.operationsTick(db, bucket, []),
  ]);
  const second = await monitoring.runDailyBackup(db, bucket);
  assert.equal(second.status, "complete");
  assert.equal(second.day, "2026-11-01");
  assert.notEqual(second.id, first.id);
  t.mock.timers.setTime(Date.parse("2026-11-01T06:10:00Z"));
  assert.deepEqual(await monitoring.runDailyBackup(db, bucket), second);
  assert.equal(
    daily.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM backup_runs WHERE json_extract(data,'$.actorId')='scheduled-operations'",
      )
      .get()?.n,
    2,
  );
  daily.sql.close();
});

test("a previous day's unfinished snapshot resumes without substituting for today or advancing a restore", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-21T04:50:00Z"),
  });
  const daily = await createHarness();
  await daily.identity();
  const db = daily.env.DB as unknown as D1Database;
  const bucket = daily.env.BUCKET as unknown as R2Bucket;
  const priorId = await operations.startBackup(db, "scheduled-operations");
  t.mock.timers.setTime(Date.parse("2026-11-21T05:10:00Z"));
  assert.equal((await monitoring.runDailyBackup(db, bucket)).status, "working");
  assert.equal(
    daily.sql.prepare("SELECT status FROM backup_runs WHERE id=?").get(priorId)
      ?.status,
    "complete",
  );
  const today = await monitoring.runDailyBackup(db, bucket);
  assert.equal(today.status, "complete");
  assert.equal(today.day, "2026-11-21");
  assert.notEqual(today.id, priorId);
  t.mock.timers.setTime(Date.parse("2026-11-22T05:10:00Z"));
  const restoration = await operations.startRestore(db, bucket, today.id!, {
    id: "owner-1",
    name: "Owner",
  });
  const original = daily.sql
    .prepare("SELECT data FROM backup_runs WHERE id=?")
    .get(restoration)?.data;
  const blocked = await monitoring.runDailyBackup(db, bucket);
  assert.equal(blocked.status, "working");
  assert.ok(blocked.retryAfterSeconds);
  assert.equal(
    daily.sql
      .prepare("SELECT data FROM backup_runs WHERE id=?")
      .get(restoration)?.data,
    original,
  );
  daily.sql.close();
});

test("a failed scheduled snapshot retries, preserves completed copies, and drains expired copies", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-21T14:00:00Z"),
  });
  const daily = await createHarness();
  await daily.identity();
  const db = daily.env.DB as unknown as D1Database;
  const bucket = daily.env.BUCKET as unknown as R2Bucket;
  const offlineBucket = {
    ...daily.env.BUCKET,
    put: async () => {
      throw new Error("temporary storage outage");
    },
  } as unknown as R2Bucket;
  const failed = await monitoring.runDailyBackup(db, offlineBucket);
  assert.equal(failed.status, "failed");
  assert.ok(failed.retryAfterSeconds);
  assert.deepEqual(await monitoring.runDailyBackup(db, bucket), failed);
  t.mock.timers.tick(300001);
  const recovered = await monitoring.runDailyBackup(db, bucket);
  assert.equal(recovered.status, "complete");
  assert.notEqual(recovered.id, failed.id);
  for (const id of ["old1", "old2"]) {
    daily.sql
      .prepare(
        "INSERT INTO backup_runs(id,at,status,data) VALUES (?,'2026-01-01','complete',?)",
      )
      .run(
        id,
        JSON.stringify({ kind: "backup", expiresAt: "2026-02-01T00:00:00Z" }),
      );
    await daily.env.BUCKET.put(operations.manifestKey(id), "expired");
  }
  assert.equal((await monitoring.runDailyBackup(db, bucket)).status, "working");
  assert.deepEqual(await monitoring.runDailyBackup(db, bucket), recovered);
  assert.equal(daily.objects.has(operations.manifestKey("old1")), false);
  assert.equal(daily.objects.has(operations.manifestKey("old2")), false);
  assert.equal(daily.objects.has(operations.manifestKey(recovered.id!)), true);
  daily.sql.close();
});
