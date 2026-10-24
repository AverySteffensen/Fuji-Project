import { BusinessError } from "./domain.ts";
import { digest, randomToken } from "./auth-security.ts";
import { rebuildIndex } from "./register-server.ts";
import { env } from "cloudflare:workers";
type Kind = "requests" | "audit" | "attachments" | "directory";
const kinds: Kind[] = ["requests", "audit", "attachments", "directory"];
type Part = { kind: Kind; key: string; sha256: string; count: number };
type FileCopy = {
  id: string;
  key: string;
  sha256: string;
  size: number;
  type: string;
};
type Backup = {
  kind: "backup";
  format: 1;
  phase: "tables" | "files" | "complete";
  actorId: string;
  kindIndex: number;
  cursor: string;
  parts: Part[];
  files: FileCopy[];
  expiresAt: string;
  manifestHash?: string;
  error?: string;
};
type Restore = {
  kind: "restore" | "verify";
  sourceId: string;
  phase: "parts" | "files" | "commit" | "index" | "complete";
  actorId: string;
  actorName: string;
  partIndex: number;
  fileIndex: number;
  versionBase: number;
  error?: string;
};
type Run = {
  id: string;
  at: string;
  status: "working" | "complete" | "failed";
  data: string;
};
export const manifestKey = (id: string) => `backup-manifests/${id}.json`;
async function manifestKeyMaterial() {
  const key = env.FUJI_BACKUP_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw new BusinessError(
      "Backup signing needs to be configured by the workspace administrator.",
      503,
    );
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(key.match(/../g)!.map((x) => parseInt(x, 16))),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function signedManifest(payload: string) {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await manifestKeyMaterial(),
      new TextEncoder().encode(payload),
    ),
  );
  return JSON.stringify({ payload, signature: Array.from(signature) });
}
async function verifiedManifest(raw: string) {
  try {
    const document = JSON.parse(raw);
    if (
      typeof document.payload !== "string" ||
      !Array.isArray(document.signature) ||
      !(await crypto.subtle.verify(
        "HMAC",
        await manifestKeyMaterial(),
        new Uint8Array(document.signature),
        new TextEncoder().encode(document.payload),
      ))
    )
      throw new BusinessError(
        "Backup signature verification failed. Purchasing records were not changed.",
        409,
      );
    return JSON.parse(document.payload) as Backup & { id: string; at: string };
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError(
      "Backup signature verification failed. Purchasing records were not changed.",
      409,
    );
  }
}
const bucketPut = (bucket: R2Bucket, key: string, value: string) =>
  bucket.put(key, value, { httpMetadata: { contentType: "application/json" } });
const maintenance = (db: D1Database) =>
  db
    .prepare(
      "SELECT value FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.until')>?",
    )
    .bind(Date.now())
    .first();
async function saveRun(
  db: D1Database,
  run: Run,
  data: Backup | Restore,
  status = run.status,
) {
  await db
    .prepare("UPDATE backup_runs SET data=?,status=? WHERE id=?")
    .bind(JSON.stringify(data), status, run.id)
    .run();
}
export async function startBackup(
  db: D1Database,
  actorId: string,
): Promise<string> {
  await manifestKeyMaterial();
  if (await maintenance(db))
    throw new BusinessError(
      "Wait until restoration finishes before creating a backup.",
      409,
    );
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  const metadata: Backup = {
    kind: "backup",
    format: 1,
    phase: "tables",
    actorId,
    kindIndex: 0,
    cursor: "",
    parts: [],
    files: [],
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  // D1 executes the batch as one transaction. The immutable staging rows preserve
  // one database snapshot while ordinary purchasing continues during R2 uploads.
  await db.batch([
    db
      .prepare(
        "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'working',?)",
      )
      .bind(id, at, JSON.stringify(metadata)),
    db
      .prepare(
        "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'requests',id,data FROM purchase_requests",
      )
      .bind(id),
    db
      .prepare(
        "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'audit',id,data FROM audit_events",
      )
      .bind(id),
    db
      .prepare(
        "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'directory',id,data FROM members",
      )
      .bind(id),
    db
      .prepare(
        "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'attachments',id,json_object('id',id,'request_id',request_id,'name',name,'type',type,'size',size,'storage_key',storage_key) FROM attachments",
      )
      .bind(id),
  ]);
  return id;
}
async function readManifest(
  db: D1Database,
  bucket: R2Bucket,
  sourceId: string,
) {
  const run = await db
    .prepare("SELECT * FROM backup_runs WHERE id=? AND status='complete'")
    .bind(sourceId)
    .first<Run>();
  const metadata = run ? (JSON.parse(run.data) as Backup) : null;
  if (
    metadata &&
    (metadata.kind !== "backup" ||
      metadata.expiresAt < new Date().toISOString())
  )
    throw new BusinessError("This backup is unavailable or expired.");
  const object = await bucket.get(manifestKey(sourceId));
  if (!object) throw new BusinessError("The backup manifest is missing.", 409);
  const raw = await object.text();
  if (
    metadata &&
    (!metadata.manifestHash || (await digest(raw)) !== metadata.manifestHash)
  )
    throw new BusinessError(
      "Backup integrity verification failed. No purchasing records were changed.",
      409,
    );
  const manifest = await verifiedManifest(raw);
  if (
    manifest.format !== 1 ||
    manifest.id !== sourceId ||
    manifest.kind !== "backup" ||
    manifest.expiresAt < new Date().toISOString()
  )
    throw new BusinessError("Unsupported or expired backup.");
  if (!run)
    await db
      .prepare(
        "INSERT OR IGNORE INTO backup_runs(id,at,status,data) VALUES (?,?,'complete',?)",
      )
      .bind(
        sourceId,
        manifest.at,
        JSON.stringify({ ...manifest, manifestHash: await digest(raw) }),
      )
      .run();
  return manifest;
}
export async function startRestore(
  db: D1Database,
  bucket: R2Bucket,
  sourceId: string,
  actor: { id: string; name: string },
  verify = false,
) {
  await readManifest(db, bucket, sourceId);
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  const version = await db
    .prepare("SELECT COALESCE(MAX(version),0) AS n FROM purchase_requests")
    .first<{ n: number }>();
  const data: Restore = {
    kind: verify ? "verify" : "restore",
    sourceId,
    actorId: actor.id,
    actorName: actor.name,
    phase: "parts",
    partIndex: 0,
    fileIndex: 0,
    versionBase: (version?.n ?? 0) + 1,
  };
  if (!verify) {
    const lock = await db
      .prepare(
        "INSERT INTO app_settings(key,value) VALUES ('restore-lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(app_settings.value,'$.until')<=?",
      )
      .bind(JSON.stringify({ id, until: Date.now() + 30 * 60_000 }), Date.now())
      .run();
    if (!lock.meta.changes)
      throw new BusinessError("Another restoration is already running.", 409);
    const lockedVersion = await db
      .prepare("SELECT COALESCE(MAX(version),0) AS n FROM purchase_requests")
      .first<{ n: number }>();
    data.versionBase = (lockedVersion?.n ?? 0) + 1;
    // Preserve a safety snapshot before switching business records. It can finish
    // uploading after restoration because the snapshot rows are independent.
    const safetyId = crypto.randomUUID();
    const safety: Backup = {
      kind: "backup",
      format: 1,
      phase: "tables",
      actorId: actor.id,
      kindIndex: 0,
      cursor: "",
      parts: [],
      files: [],
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'working',?)",
          )
          .bind(safetyId, at, JSON.stringify(safety)),
        db
          .prepare(
            "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'requests',id,data FROM purchase_requests",
          )
          .bind(safetyId),
        db
          .prepare(
            "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'audit',id,data FROM audit_events",
          )
          .bind(safetyId),
        db
          .prepare(
            "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'directory',id,data FROM members",
          )
          .bind(safetyId),
        db
          .prepare(
            "INSERT INTO backup_rows(run_id,kind,row_id,data) SELECT ?,'attachments',id,json_object('id',id,'request_id',request_id,'name',name,'type',type,'size',size,'storage_key',storage_key) FROM attachments",
          )
          .bind(safetyId),
        db
          .prepare(
            "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'working',?)",
          )
          .bind(id, at, JSON.stringify(data)),
      ]);
    } catch (error) {
      await db
        .prepare(
          "DELETE FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.id')=?",
        )
        .bind(id)
        .run();
      throw error;
    }
  } else
    await db
      .prepare(
        "INSERT INTO backup_runs(id,at,status,data) VALUES (?,?,'working',?)",
      )
      .bind(id, at, JSON.stringify(data))
      .run();
  return id;
}
async function advanceBackup(
  db: D1Database,
  bucket: R2Bucket,
  run: Run,
  data: Backup,
  deadline: number,
) {
  while (data.phase === "tables" && Date.now() < deadline) {
    if (data.kindIndex >= kinds.length) {
      data.phase = "files";
      data.cursor = "";
      break;
    }
    const kind = kinds[data.kindIndex];
    const rows = await db
      .prepare(
        "SELECT row_id,data FROM backup_rows WHERE run_id=? AND kind=? AND row_id>? ORDER BY row_id LIMIT 100",
      )
      .bind(run.id, kind, data.cursor)
      .all<{ row_id: string; data: string }>();
    if (!rows.results.length) {
      data.kindIndex++;
      data.cursor = "";
      continue;
    }
    const raw = JSON.stringify(rows.results),
      key = `backups/${run.id}/parts/${kind}-${data.parts.length}.json`;
    await bucketPut(bucket, key, raw);
    data.parts.push({
      kind,
      key,
      sha256: await digest(raw),
      count: rows.results.length,
    });
    data.cursor = rows.results[rows.results.length - 1].row_id;
  }
  while (data.phase === "files" && Date.now() < deadline) {
    const row = await db
      .prepare(
        "SELECT row_id,data FROM backup_rows WHERE run_id=? AND kind='attachments' AND row_id>? ORDER BY row_id LIMIT 1",
      )
      .bind(run.id, data.cursor)
      .first<{ row_id: string; data: string }>();
    if (!row) {
      data.phase = "complete";
      break;
    }
    const info = JSON.parse(row.data) as {
      size: number;
      type: string;
      storage_key?: string;
    };
    const live = await bucket.get(info.storage_key || row.row_id);
    if (!live)
      throw new BusinessError(
        "An attachment is missing. The backup could not be completed.",
        409,
      );
    const bytes = new Uint8Array(await live.arrayBuffer());
    if (bytes.byteLength !== info.size)
      throw new BusinessError("An attachment has an unexpected size.", 409);
    const key = `backups/${run.id}/files/${row.row_id}`,
      sha256 = await digest(bytes);
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: info.type },
      customMetadata: { sha256 },
    });
    data.files.push({
      id: row.row_id,
      key,
      sha256,
      size: bytes.byteLength,
      type: info.type,
    });
    data.cursor = row.row_id;
  }
  if (data.phase === "complete") {
    const raw = await signedManifest(
      JSON.stringify({ ...data, id: run.id, at: run.at }),
    );
    await bucketPut(bucket, manifestKey(run.id), raw);
    data.manifestHash = await digest(raw);
    await db.batch([
      db
        .prepare("UPDATE backup_runs SET data=?,status='complete' WHERE id=?")
        .bind(JSON.stringify(data), run.id),
      db.prepare("DELETE FROM backup_rows WHERE run_id=?").bind(run.id),
    ]);
  } else await saveRun(db, run, data);
}
async function advanceRestore(
  db: D1Database,
  bucket: R2Bucket,
  run: Run,
  data: Restore,
  deadline: number,
) {
  const manifest = await readManifest(db, bucket, data.sourceId);
  if (data.kind === "restore") {
    const lock = await db
      .prepare(
        `UPDATE app_settings SET value=? WHERE key='restore-lock' AND json_extract(value,'$.id')=? ${data.phase === "index" ? "" : "AND json_extract(value,'$.until')>?"}`,
      )
      .bind(
        JSON.stringify({ id: run.id, until: Date.now() + 30 * 60_000 }),
        run.id,
        ...(data.phase === "index" ? [] : [Date.now()]),
      )
      .run();
    if (!lock.meta.changes)
      throw new BusinessError(
        "The restoration lock expired. Start a new restoration.",
        409,
      );
  }
  while (data.phase === "parts" && Date.now() < deadline) {
    const part = manifest.parts[data.partIndex];
    if (!part) {
      data.phase = "files";
      break;
    }
    if (
      !kinds.includes(part.kind) ||
      !part.key.startsWith(`backups/${data.sourceId}/parts/`)
    )
      throw new BusinessError("Invalid backup contents.");
    const object = await bucket.get(part.key);
    if (!object) throw new BusinessError("A backup part is missing.");
    const raw = await object.text();
    if ((await digest(raw)) !== part.sha256)
      throw new BusinessError(
        "Backup checksum verification failed. Purchasing records were not changed.",
        409,
      );
    const rows = JSON.parse(raw) as { row_id: string; data: string }[];
    if (rows.length !== part.count || rows.length > 100)
      throw new BusinessError("Invalid backup row count.");
    await db.batch(
      rows.map((row) =>
        db
          .prepare(
            "INSERT OR REPLACE INTO backup_rows(run_id,kind,row_id,data) VALUES (?,?,?,?)",
          )
          .bind(run.id, part.kind, row.row_id, row.data),
      ),
    );
    data.partIndex++;
  }
  while (data.phase === "files" && Date.now() < deadline) {
    const file = manifest.files[data.fileIndex];
    if (!file) {
      data.phase = "commit";
      break;
    }
    if (!file.key.startsWith(`backups/${data.sourceId}/files/`))
      throw new BusinessError("Invalid backup attachment key.");
    const object = await bucket.get(file.key);
    if (!object) throw new BusinessError("A backed-up attachment is missing.");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== file.size || (await digest(bytes)) !== file.sha256)
      throw new BusinessError(
        "Attachment checksum verification failed. Purchasing records were not changed.",
        409,
      );
    if (data.kind === "restore") {
      const storageKey = `restored/${run.id}/${file.id}`;
      await bucket.put(storageKey, bytes, {
        httpMetadata: { contentType: file.type },
      });
      await db
        .prepare(
          "UPDATE backup_rows SET data=json_set(data,'$.storage_key',?) WHERE run_id=? AND kind='attachments' AND row_id=?",
        )
        .bind(storageKey, run.id, file.id)
        .run();
    }
    data.fileIndex++;
  }
  if (data.phase === "commit") {
    const broken = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM backup_rows a WHERE a.run_id=? AND a.kind='attachments' AND NOT EXISTS(SELECT 1 FROM backup_rows p WHERE p.run_id=a.run_id AND p.kind='requests' AND p.row_id=json_extract(a.data,'$.request_id'))",
      )
      .bind(run.id)
      .first<{ n: number }>();
    if (broken?.n)
      throw new BusinessError("Backup attachment references are inconsistent.");
    const files = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM backup_rows WHERE run_id=? AND kind='attachments'",
      )
      .bind(run.id)
      .first<{ n: number }>();
    if ((files?.n ?? 0) !== manifest.files.length)
      throw new BusinessError("Backup attachment counts do not match.");
    if (data.kind === "restore") {
      const at = new Date().toISOString();
      const restoredData =
        "json_set(b.data,'$.version',json_extract(b.data,'$.version')+?,'$.updatedAt',?,'$.lastMutationId',?)";
      await db.batch([
        db
          .prepare(
            `INSERT INTO audit_events(id,request_id,data,at) SELECT b.run_id||':'||b.row_id,b.row_id,json_object('id',b.run_id||':'||b.row_id,'requestId',b.row_id,'action','Restored from backup','actorId',?,'actorName',?,'at',?,'note',?,'revision',json_extract(b.data,'$.revision'),'changes',json_array(json_object('field','record','before',json(p.data),'after',json(${restoredData})))),? FROM backup_rows b LEFT JOIN purchase_requests p ON p.id=b.row_id WHERE b.run_id=? AND b.kind='requests'`,
          )
          .bind(
            data.actorId,
            data.actorName,
            at,
            `Restored backup ${data.sourceId}.`,
            data.versionBase,
            at,
            run.id,
            at,
            run.id,
          ),
        db
          .prepare(
            "INSERT INTO audit_events(id,request_id,data,at) SELECT ?||':removed:'||p.id,p.id,json_object('id',?||':removed:'||p.id,'requestId',p.id,'action','Removed by restoration','actorId',?,'actorName',?,'at',?,'note',?,'revision',json_extract(p.data,'$.revision'),'changes',json_array(json_object('field','record','before',json(p.data),'after',NULL))),? FROM purchase_requests p WHERE NOT EXISTS(SELECT 1 FROM backup_rows b WHERE b.run_id=? AND b.kind='requests' AND b.row_id=p.id)",
          )
          .bind(
            run.id,
            run.id,
            data.actorId,
            data.actorName,
            at,
            `Restored backup ${data.sourceId}; subsequent request retained in audit history.`,
            at,
            run.id,
          ),
        db
          .prepare(
            "INSERT OR IGNORE INTO audit_events(id,request_id,data,at) SELECT row_id,json_extract(data,'$.requestId'),data,json_extract(data,'$.at') FROM backup_rows WHERE run_id=? AND kind='audit'",
          )
          .bind(run.id),
        db
          .prepare(
            "INSERT OR IGNORE INTO members(id,email,data) SELECT row_id,lower(json_extract(data,'$.email')),json_set(data,'$.active',json('false')) FROM backup_rows WHERE run_id=? AND kind='directory'",
          )
          .bind(run.id),
        db.prepare("DELETE FROM attachments"),
        db.prepare("DELETE FROM purchase_requests"),
        db.prepare("DELETE FROM request_index"),
        db
          .prepare(
            `INSERT INTO purchase_requests(id,data,version,updated_at) SELECT b.row_id,${restoredData},json_extract(b.data,'$.version')+?,? FROM backup_rows b WHERE b.run_id=? AND b.kind='requests'`,
          )
          .bind(data.versionBase, at, run.id, data.versionBase, at, run.id),
        db
          .prepare(
            "INSERT INTO attachments(id,request_id,name,type,size,storage_key) SELECT row_id,json_extract(data,'$.request_id'),json_extract(data,'$.name'),json_extract(data,'$.type'),json_extract(data,'$.size'),json_extract(data,'$.storage_key') FROM backup_rows WHERE run_id=? AND kind='attachments'",
          )
          .bind(run.id),
        db.prepare("DELETE FROM app_settings WHERE key='register-index-v3'"),
        db
          .prepare("UPDATE backup_runs SET data=? WHERE id=?")
          .bind(JSON.stringify({ ...data, phase: "index" }), run.id),
      ]);
      data.phase = "index";
    } else data.phase = "complete";
  }
  if (data.phase === "index") {
    await rebuildIndex(db);
    data.phase = "complete";
  }
  if (data.phase === "complete") {
    delete data.error;
    await db.batch([
      db
        .prepare("UPDATE backup_runs SET data=?,status='complete' WHERE id=?")
        .bind(JSON.stringify(data), run.id),
      db.prepare("DELETE FROM backup_rows WHERE run_id=?").bind(run.id),
      db
        .prepare(
          "DELETE FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.id')=?",
        )
        .bind(run.id),
    ]);
  } else await saveRun(db, run, data);
}
export async function runStep(db: D1Database, bucket: R2Bucket, id: string) {
  const lease = randomToken(12),
    now = Date.now(),
    key = `job-lease:${id}`;
  const locked = await db
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(app_settings.value,'$.until')<=?",
    )
    .bind(key, JSON.stringify({ lease, until: now + 60_000 }), now)
    .run();
  if (!locked.meta.changes)
    throw new BusinessError(
      "This operation is already running. Its progress will update shortly.",
      409,
    );
  let run: Run | null = null;
  try {
    run = await db
      .prepare("SELECT * FROM backup_runs WHERE id=?")
      .bind(id)
      .first<Run>();
    if (!run) throw new BusinessError("Operation not found.", 404);
    if (run.status !== "working") return run;
    const data = JSON.parse(run.data) as Backup | Restore;
    if (data.kind === "backup")
      await advanceBackup(db, bucket, run, data, now + 15_000);
    else await advanceRestore(db, bucket, run, data, now + 15_000);
    return await db
      .prepare("SELECT * FROM backup_runs WHERE id=?")
      .bind(id)
      .first<Run>();
  } catch (error) {
    if (run) {
      const data = JSON.parse(run.data) as Backup | Restore;
      data.error =
        error instanceof BusinessError
          ? error.message
          : "The operation failed. Check storage and retry.";
      const persisted = await db
        .prepare("SELECT data FROM backup_runs WHERE id=?")
        .bind(id)
        .first<{ data: string }>();
      const phase = persisted
        ? (JSON.parse(persisted.data) as Backup | Restore)
        : data;
      if (
        phase.kind === "restore" &&
        phase.phase === "index" &&
        !(error instanceof BusinessError && error.status === 409)
      )
        await saveRun(db, run, { ...phase, error: data.error }, "working");
      else {
        await saveRun(db, run, data, "failed");
        await db
          .prepare("DELETE FROM backup_rows WHERE run_id=?")
          .bind(id)
          .run();
        await db
          .prepare(
            "DELETE FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.id')=?",
          )
          .bind(id)
          .run();
      }
    }
    throw error;
  } finally {
    await db
      .prepare(
        "DELETE FROM app_settings WHERE key=? AND json_extract(value,'$.lease')=?",
      )
      .bind(key, lease)
      .run();
  }
}
export async function pruneBackups(db: D1Database, bucket: R2Bucket) {
  const expired = await db
    .prepare(
      "SELECT id FROM backup_runs WHERE json_extract(data,'$.kind')='backup' AND json_extract(data,'$.expiresAt')<? ORDER BY at LIMIT 1",
    )
    .bind(new Date().toISOString())
    .first<{ id: string }>();
  if (!expired) return;
  const list = await bucket.list({
    prefix: `backups/${expired.id}/`,
    limit: 1000,
  });
  if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
  if (!list.truncated) {
    await bucket.delete(manifestKey(expired.id));
    await db.batch([
      db.prepare("DELETE FROM backup_runs WHERE id=?").bind(expired.id),
      db.prepare("DELETE FROM backup_rows WHERE run_id=?").bind(expired.id),
    ]);
  }
}
export async function discoverBackups(
  db: D1Database,
  bucket: R2Bucket,
  cursor?: string,
) {
  const list = await bucket.list({
    prefix: "backup-manifests/",
    limit: 20,
    ...(cursor ? { cursor } : {}),
  });
  let found = 0;
  for (const object of list.objects) {
    const id = object.key.slice("backup-manifests/".length, -".json".length);
    try {
      await readManifest(db, bucket, id);
      found++;
    } catch (error) {
      if (!(error instanceof BusinessError) || error.status >= 500) throw error;
    }
  }
  return { found, cursor: list.truncated ? list.cursor : null };
}
