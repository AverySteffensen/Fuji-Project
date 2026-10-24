import { test } from "node:test";
import assert from "node:assert/strict";
import { serveSecureRequest } from "../lib/purchasing/security.ts";
import { proxy } from "../proxy.ts";

test("the framework middleware redirects HTTP and forwards protected HTTPS requests", async () => {
  const redirect = await proxy(
    new Request("http://fuji.example/api/workspace"),
  );
  assert.equal(redirect.status, 308);
  assert.equal(
    redirect.headers.get("Location"),
    "https://fuji.example/api/workspace",
  );
  assert.equal(redirect.headers.get("x-middleware-next"), null);
  const blocked = await proxy(
    new Request("http://fuji.example/api/requests", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(blocked.status, 400);
  assert.equal(blocked.headers.get("x-middleware-next"), null);
  const secure = await proxy(new Request("https://fuji.example/api/workspace"));
  assert.equal(secure.headers.get("x-middleware-next"), "1");
  assert.equal(
    secure.headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
  assert.equal(secure.headers.get("Cache-Control"), "private, no-store");
});

test("insecure page requests redirect to HTTPS without opening purchasing data", async () => {
  for (const method of ["GET", "HEAD"]) {
    let served = false;
    const result = await serveSecureRequest(
      new Request("http://fuji.example/api/workspace?sort=neededBy", {
        method,
      }),
      () => {
        served = true;
        return Response.json({ confidential: true });
      },
    );
    assert.equal(result.status, 308);
    assert.equal(
      result.headers.get("Location"),
      "https://fuji.example/api/workspace?sort=neededBy",
    );
    assert.equal(served, false);
    assert.equal(await result.text(), "");
    assert.equal(result.headers.get("Strict-Transport-Security"), null);
  }
});

test("insecure writes and uploads never reach application handlers, even with forged proxy headers", async () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    let served = false;
    const result = await serveSecureRequest(
      new Request("http://fuji.example/api/requests", {
        method,
        body: "purchase information",
        headers: { "X-Forwarded-Proto": "https", Forwarded: "proto=https" },
      }),
      () => {
        served = true;
        return Response.json({ saved: true });
      },
    );
    assert.equal(result.status, 400);
    assert.equal(result.headers.get("Location"), null);
    assert.equal(served, false);
    assert.match(
      ((await result.json()) as { error: string }).error,
      /HTTPS is required/,
    );
  }
});

test("HTTPS preserves application data, cookies and existing policies while protecting private responses", async () => {
  const result = await serveSecureRequest(
    new Request("https://fuji.example/api/requests", { method: "POST" }),
    () =>
      Response.json(
        { id: "purchase-1", total: 2545 },
        {
          status: 201,
          headers: {
            "Set-Cookie": "session=test; Secure; HttpOnly; SameSite=Lax",
            "Content-Security-Policy": "default-src 'self'",
            "Cache-Control": "public, max-age=3600",
          },
        },
      ),
  );
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { id: "purchase-1", total: 2545 });
  assert.equal(
    result.headers.get("Set-Cookie"),
    "session=test; Secure; HttpOnly; SameSite=Lax",
  );
  assert.equal(
    result.headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
  assert.match(
    result.headers.get("Content-Security-Policy")!,
    /default-src 'self'/,
  );
  assert.match(
    result.headers.get("Content-Security-Policy")!,
    /upgrade-insecure-requests/,
  );
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(result.headers.get("Referrer-Policy"), "same-origin");
});

test("protected attachment downloads preserve bytes and download headers", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 0, 255]);
  const result = await serveSecureRequest(
    new Request("https://fuji.example/api/attachments/quote-1"),
    () =>
      new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="quote.pdf"',
        },
      }),
  );
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(result.headers.get("Content-Type"), "application/pdf");
  assert.equal(
    result.headers.get("Content-Disposition"),
    'attachment; filename="quote.pdf"',
  );
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
});

test("HTML, React streams and authentication errors cannot become shared cached records", async () => {
  for (const [path, type, status] of [
    ["/", "text/html; charset=utf-8", 200],
    ["/requests/1", "text/x-component", 200],
    ["/api/workspace", "application/json", 401],
  ] as const) {
    const result = await serveSecureRequest(
      new Request("https://fuji.example" + path),
      () =>
        new Response("protected response", {
          status,
          headers: { "Content-Type": type },
        }),
    );
    assert.equal(result.status, status);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(await result.text(), "protected response");
  }
});

test("public assets retain their cache policy and HTTPS requests ignore untrusted forwarding headers", async () => {
  const result = await serveSecureRequest(
    new Request("https://fuji.example/assets/app-hash.js", {
      headers: { "X-Forwarded-Proto": "http" },
    }),
    () =>
      new Response("asset", {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      }),
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.headers.get("Cache-Control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    result.headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
});

test("development previews can run on HTTP without persistent HTTPS policies", async () => {
  const result = await serveSecureRequest(
    new Request("http://localhost:5173/api/workspace"),
    () => Response.json({ preview: true }),
    { development: true },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { preview: true });
  assert.equal(result.headers.get("Strict-Transport-Security"), null);
  assert.equal(result.headers.get("Content-Security-Policy"), null);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
});
