import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHarness } from "./harness.ts";
import { buildSeed } from "../lib/purchasing/seed.ts";
import { indexStatement } from "../lib/purchasing/register-server.ts";
const h = await createHarness();
await h.identity();
const base = buildSeed().requests[0];
const insert = h.sql.prepare(
  "INSERT INTO purchase_requests(id,data,version,updated_at) VALUES (?,?,?,?)",
);
h.sql.exec("BEGIN");
for (let i = 0; i < 10000; i++) {
  const p = {
    ...base,
    id: `bench-${i.toString().padStart(5, "0")}`,
    number: `BENCH-${i.toString().padStart(5, "0")}`,
    title: i < 1000 ? "Bench export" : "Performance record",
    priority: (["Low", "Medium", "High"] as const)[i % 3],
    requesterId: "owner-1",
    sample: false,
    version: 1,
  };
  insert.run(p.id, JSON.stringify(p), p.version, p.updatedAt);
  const statement = indexStatement(h.env.DB as any, p) as any;
  h.sql.prepare(statement.query).run(...statement.values);
}
h.sql.exec("COMMIT");
const elapsed = await Promise.all(
  Array.from({ length: 25 }, async (_, i) => {
    const start = performance.now();
    const query =
      i % 2
        ? "priority=High&sortField=total&direction=desc"
        : "search=Performance&sortField=submittedAt&direction=desc";
    const response = await h.routes.register.GET(
      h.req("GET", "", undefined, `/api/register?${query}&size=25`),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.requests.length, 25);
    assert.ok(data.total > 1000);
    return performance.now() - start;
  }),
);
elapsed.sort((a, b) => a - b);
const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1];
const exportStart = performance.now();
const exported = await h.routes.export.GET(
  h.req(
    "GET",
    "",
    undefined,
    "/api/register/export?search=Bench%20export&sortField=number&direction=asc",
  ),
);
assert.equal(exported.status, 200);
assert.equal(exported.headers.get("X-Export-Count"), "1000");
const bytes = await exported.arrayBuffer();
const exportMs = performance.now() - exportStart;
assert.ok(
  p95 < 2000,
  `Search/filter p95 ${p95.toFixed(1)} ms exceeds 2 seconds.`,
);
assert.ok(
  exportMs < 10000,
  `Export ${exportMs.toFixed(1)} ms exceeds 10 seconds.`,
);
console.log(
  JSON.stringify({
    environment:
      "Local Node 24, SQLite D1-compatible adapter, actual API handlers; excludes hosted network latency",
    requests: 10000,
    concurrentUsers: 25,
    searchFilterP95Ms: Math.round(p95),
    exportRows: 1000,
    exportMs: Math.round(exportMs),
    exportBytes: bytes.byteLength,
  }),
);
h.sql.close();
