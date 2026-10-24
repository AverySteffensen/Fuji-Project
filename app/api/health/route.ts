import { env } from "cloudflare:workers";
export async function GET() {
  const start = Date.now();
  try {
    if (!env.DB || !env.BUCKET) throw new Error("Required storage unavailable");
    await env.DB.prepare("SELECT 1 AS ok").first();
    await env.BUCKET.head("health/connectivity-probe");
    return Response.json(
      {
        status: "ok",
        checkedAt: new Date().toISOString(),
        duration: Date.now() - start,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", checkedAt: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
