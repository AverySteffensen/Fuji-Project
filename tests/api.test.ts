import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
// Exercises the actual route handlers against SQLite and a D1-compatible adapter.
const sql = new DatabaseSync(":memory:");
sql.exec(
  readFileSync("drizzle/0000_futuristic_doctor_doom.sql", "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  ),
);
class Statement {
  values: any[] = [];
  query: string;
  constructor(query: string) {
    this.query = query;
  }
  bind(...v: any[]) {
    this.values = v;
    return this;
  }
  async first() {
    return sql.prepare(this.query).get(...this.values) ?? null;
  }
  async all() {
    return {
      results: sql.prepare(this.query).all(...this.values),
      success: true,
    };
  }
  async run() {
    const r = sql.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
const objects = new Map<string, { body: ArrayBuffer; type: string }>();
(globalThis as any).__testEnv = {
  DB: {
    prepare: (q: string) => new Statement(q),
    batch: async (statements: Statement[]) => {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const st of statements) {
          const r = sql.prepare(st.query).run(...st.values);
          result.push({ success: true, meta: { changes: Number(r.changes) } });
        }
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  },
  BUCKET: {
    put: async (id: string, body: ArrayBuffer, opts: any) =>
      objects.set(id, { body, type: opts.httpMetadata.contentType }),
    get: async (id: string) => objects.get(id),
    delete: async (id: string) => objects.delete(id),
  },
};
const workspace = await import("../app/api/workspace/route.ts");
const create = await import("../app/api/requests/route.ts");
const update = await import("../app/api/requests/[id]/route.ts");
const people = await import("../app/api/members/route.ts");
const attachment = await import("../app/api/attachments/[id]/route.ts");
const identity = (id = "owner-1", email = "owner@example.test") => {
  (globalThis as any).__testAuthHeaders = new Headers({
    "oai-authenticated-user-id": id,
    "oai-authenticated-user-email": email,
  });
};
const req = (method = "GET", actor = "", data?: any) =>
  new Request("https://test.local/api", {
    method,
    headers: {
      ...(actor ? { "x-demo-member": actor } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
      Origin: "https://test.local",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
const read = async (r: Response) => ({
  status: r.status,
  data: (await r.json()) as any,
});
const input = {
  department: "Packaging (90)",
  purchaseType: "Facilities",
  priority: "High",
  neededBy: "2026-11-01",
  supplier: "Test Supplier",
  explanation: "API integration test",
  items: [
    {
      description: "API test part",
      partNumber: "TEST-1",
      quantity: 2,
      unitPrice: 1100,
    },
  ],
  freight: 5,
  tax: 0,
  quotes: [],
};
test("persistent API workflow, permissions, version conflicts, attachments, and membership", async (t) => {
  identity();
  let initial: any, created: any;
  await t.test("initial workspace seeds 64 samples exactly once", async () => {
    initial = await read(await workspace.GET(req()));
    assert.equal(initial.status, 200);
    assert.equal(initial.data.requests.length, 64);
    assert.equal(initial.data.owner, true);
    const second = await read(await workspace.GET(req()));
    assert.equal(second.data.requests.length, 64);
  });
  await t.test(
    "server ignores forged ownership/status and calculates totals",
    async () => {
      const r = await read(
        await create.POST(
          req("POST", "demo-employee", {
            ...input,
            total: 1,
            status: "Approved",
            requesterId: "forged",
            order: { poNumber: "BAD" },
          }),
        ),
      );
      assert.equal(r.status, 201);
      created = r.data;
      assert.equal(created.total, 2205);
      assert.equal(created.requesterId, "demo-employee");
      assert.equal(created.status, "Pending");
      assert.equal(created.order, null);
    },
  );
  const patch = async (
    actor: string,
    action: string,
    extra: any = {},
    version = created.version,
  ) =>
    read(
      await update.PATCH(req("PATCH", actor, { action, version, ...extra }), {
        params: Promise.resolve({ id: created.id }),
      }),
    );
  await t.test(
    "controller cannot skip supervisor and employee cannot approve",
    async () => {
      assert.equal((await patch("demo-controller", "approve")).status, 403);
      assert.equal((await patch("demo-employee", "approve")).status, 403);
    },
  );
  await t.test("supervisor rejection requires a reason", async () => {
    assert.equal((await patch("demo-supervisor", "reject")).status, 400);
    const r = await patch("demo-supervisor", "reject", {
      note: "Confirm the right specification.",
    });
    assert.equal(r.status, 200);
    created = r.data;
  });
  await t.test(
    "requester revision preserves full prior version in audit storage",
    async () => {
      const r = await patch("demo-employee", "resubmit", {
        fields: { ...input, explanation: "Specification confirmed." },
      });
      assert.equal(r.status, 200);
      created = r.data;
      assert.equal(created.revision, 2);
      assert.equal(created.status, "Pending");
      const events = sql
        .prepare("SELECT data FROM audit_events WHERE request_id=?")
        .all(created.id)
        .map((r: any) => JSON.parse(r.data));
      const revised = events.find(
        (a: any) => a.action === "Revised and resubmitted",
      );
      assert.equal(revised.previousVersion.status, "Rejected");
      assert.equal(
        revised.previousVersion.rejectionReason,
        "Confirm the right specification.",
      );
    },
  );
  await t.test(
    "stale write cannot change state or create an audit event",
    async () => {
      const before = (
        sql
          .prepare("SELECT COUNT(*) n FROM audit_events WHERE request_id=?")
          .get(created.id) as any
      ).n;
      assert.equal(
        (await patch("demo-supervisor", "approve", {}, 1)).status,
        409,
      );
      assert.equal(
        (
          sql
            .prepare("SELECT COUNT(*) n FROM audit_events WHERE request_id=?")
            .get(created.id) as any
        ).n,
        before,
      );
    },
  );
  await t.test(
    "all required approvals persist dates and final status",
    async () => {
      for (const actor of ["demo-supervisor", "demo-controller", "demo-vp"]) {
        const r = await patch(actor, "approve");
        assert.equal(r.status, 200);
        created = r.data;
      }
      assert.equal(created.status, "Approved");
      assert.equal(created.approvals.length, 3);
      assert.ok(created.approvedAt);
    },
  );
  await t.test(
    "accounting records PO and fulfillment while employees are blocked",
    async () => {
      const order = {
        poNumber: "TEST-PO-1",
        orderedAt: new Date().toISOString().slice(0, 10),
        carrier: "Sample carrier",
        trackingNumber: "TEST-TRACK",
      };
      assert.equal(
        (await patch("demo-employee", "order", { order })).status,
        403,
      );
      const r = await patch("demo-accounting", "order", { order });
      assert.equal(r.status, 200);
      created = r.data;
      assert.equal(created.order.poNumber, "TEST-PO-1");
    },
  );
  await t.test(
    "attachment upload persists file metadata and scoped download",
    async () => {
      const f = new FormData();
      f.append(
        "file",
        new File(["Quote test"], "quote.txt", { type: "text/plain" }),
      );
      const upload = new Request("https://test.local/api", {
        method: "POST",
        headers: {
          "x-demo-member": "demo-employee",
          Origin: "https://test.local",
        },
        body: f,
      });
      const uploaded = await read(
        await attachment.POST(upload, {
          params: Promise.resolve({ id: created.id }),
        }),
      );
      assert.equal(uploaded.status, 201);
      const downloaded = await attachment.GET(req("GET", "demo-employee"), {
        params: Promise.resolve({ id: uploaded.data.id }),
      });
      assert.equal(downloaded.status, 200);
      assert.equal(await downloaded.text(), "Quote test");
      const blocked = await attachment.GET(req("GET", "demo-employee-2"), {
        params: Promise.resolve({ id: uploaded.data.id }),
      });
      assert.equal(blocked.status, 403);
    },
  );
  await t.test(
    "workspace reload retains proposal, approvals, PO, and attachment",
    async () => {
      const reload = await read(
        await workspace.GET(req("GET", "demo-employee")),
      );
      const found = reload.data.requests.find((p: any) => p.id === created.id);
      assert.ok(found);
      assert.equal(found.approvals.length, 3);
      assert.equal(found.attachments.length, 1);
      assert.equal(found.order.poNumber, "TEST-PO-1");
      assert.ok(
        reload.data.requests.every(
          (p: any) => p.requesterId === "demo-employee",
        ),
      );
    },
  );
  await t.test(
    "membership preserves member IDs across role edits and blocks owner/sample edits",
    async () => {
      const m = await read(
        await people.POST(
          req("POST", "", {
            name: "Real member",
            email: "member@example.test",
            role: "employee",
          }),
        ),
      );
      assert.equal(m.status, 201);
      const edit = await read(
        await people.POST(
          req("POST", "", {
            name: "Real member",
            email: "member@example.test",
            role: "controller",
          }),
        ),
      );
      assert.equal(edit.data.id, m.data.id);
      assert.equal(
        (
          await read(
            await people.POST(
              req("POST", "", {
                name: "Owner",
                email: "owner@example.test",
                role: "employee",
              }),
            ),
          )
        ).status,
        400,
      );
      identity("member-login", "member@example.test");
      const nonOwner = await read(await workspace.GET(req()));
      assert.equal(nonOwner.status, 200);
      assert.equal(nonOwner.data.owner, false);
      assert.equal(
        (await read(await workspace.GET(req("GET", "demo-vp")))).status,
        403,
      );
      assert.equal(
        (
          await read(
            await people.POST(
              req("POST", "", {
                name: "X",
                email: "x@example.test",
                role: "controller",
              }),
            ),
          )
        ).status,
        403,
      );
      identity();
    },
  );
  await t.test(
    "review regression: concurrent approvals accept one write and one audit record",
    async () => {
      const newProposal = await read(
        await create.POST(
          req("POST", "demo-employee", {
            ...input,
            items: [
              {
                description: "Concurrent part",
                partNumber: "C",
                quantity: 1,
                unitPrice: 100,
              },
            ],
          }),
        ),
      );
      const p = newProposal.data;
      const before = (
        sql
          .prepare("SELECT COUNT(*) n FROM audit_events WHERE request_id=?")
          .get(p.id) as any
      ).n;
      const results = await Promise.all(
        [1, 2].map(() =>
          update.PATCH(
            req("PATCH", "demo-supervisor", {
              action: "approve",
              version: p.version,
            }),
            { params: Promise.resolve({ id: p.id }) },
          ),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (
          sql
            .prepare("SELECT COUNT(*) n FROM audit_events WHERE request_id=?")
            .get(p.id) as any
        ).n,
        before + 1,
      );
    },
  );
  await t.test(
    "review regression: malformed and oversized JSON are rejected",
    async () => {
      for (const [body, status] of [
        ["{bad", 400],
        ["x".repeat(200001), 413],
        ["null", 400],
      ] as const) {
        const r = await create.POST(
          new Request("https://test.local/api", { method: "POST", body }),
        );
        assert.equal(r.status, status);
      }
    },
  );
  await t.test(
    "review regression: demo actors cannot see owner-created live proposals",
    async () => {
      const r = await read(await create.POST(req("POST", "", input)));
      assert.equal(r.status, 201);
      assert.equal(r.data.sample, false);
      const demoView = await read(
        await workspace.GET(req("GET", "demo-accounting")),
      );
      assert.equal(
        demoView.data.requests.some((p: any) => p.id === r.data.id),
        false,
      );
      const blocked = await update.PATCH(
        req("PATCH", "demo-accounting", {
          action: "order",
          version: 1,
          order: { poNumber: "BLOCK", orderedAt: "2026-10-22" },
        }),
        { params: Promise.resolve({ id: r.data.id }) },
      );
      assert.equal(blocked.status, 403);
    },
  );
  await t.test(
    "cross-origin writes and anonymous requests are rejected",
    async () => {
      const cross = new Request("https://test.local/api", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      assert.equal((await read(await create.POST(cross))).status, 403);
      (globalThis as any).__testAuthHeaders = new Headers();
      assert.equal((await read(await workspace.GET(req()))).status, 401);
      identity();
    },
  );
  sql.close();
});
