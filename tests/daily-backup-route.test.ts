import assert from "node:assert/strict";
import { test } from "node:test";
import { createHarness } from "./harness.ts";
import { digest } from "../lib/purchasing/crypto.ts";
import { backupProof } from "../scripts/run-daily-backup.mjs";
import { POST } from "../app/api/operations/daily-backup/route.ts";

test("daily backup access is scoped to advancing the day's snapshot", async () => {
  const h = await createHarness();
  await h.identity();
  const token = "test-only-site-service-credential";
  const proof = backupProof(token);
  const call = (value = "") =>
    POST(
      new Request("https://test.local/api/operations/daily-backup", {
        method: "POST",
        headers: { "X-Fuji-Backup-Proof": value },
      }),
    );
  assert.equal((await call(proof)).status, 403);
  Object.assign(h.env, { FUJI_DAILY_BACKUP_VERIFIER: await digest(proof) });
  for (const invalid of ["", token, "0".repeat(64)])
    assert.equal((await call(invalid)).status, 403);
  const count = () =>
    h.sql.prepare("SELECT COUNT(*) AS n FROM backup_runs").get()?.n;
  assert.equal(count(), 0);
  h.signOut();
  const first = await call(proof);
  assert.equal(first.status, 200);
  const receipt = (await first.json()) as Record<string, unknown>;
  assert.equal(receipt.status, "complete");
  assert.deepEqual(Object.keys(receipt).sort(), [
    "day",
    "expiresAt",
    "id",
    "status",
  ]);
  assert.equal(
    ((await (await call(proof)).json()) as typeof receipt).id,
    receipt.id,
  );
  assert.equal(count(), 1);
});
