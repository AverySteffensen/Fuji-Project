// Run independently from the purchasing app so it can alert during an app outage.
type MonitorEnv = { APP_ORIGIN: string; APP_OPERATIONS_TOKEN: string; SITE_ACCESS_TOKEN?: string; ALERT_WEBHOOK_URL: string; STATE: KVNamespace };
type Check = { at: string; ok: boolean; duration: number; message: string };
export async function monitor(env: MonitorEnv, fetcher: typeof fetch = fetch) {
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== "https:" || origin.pathname !== "/") throw new Error("APP_ORIGIN must be an HTTPS origin.");
  const webhook = new URL(env.ALERT_WEBHOOK_URL);
  if (webhook.protocol !== "https:") throw new Error("Alerts require an HTTPS destination.");
  const headers: Record<string, string> = env.SITE_ACCESS_TOKEN ? { "OAI-Sites-Authorization": `Bearer ${env.SITE_ACCESS_TOKEN}` } : {};
  const at = new Date().toISOString(), start = Date.now();
  let ok = false;
  try {
    const response = await fetcher(new URL("/api/health", origin), { headers, signal: AbortSignal.timeout(10_000), redirect: "error" });
    const body = await response.json() as { status?: string };
    ok = response.ok && body.status === "ok";
  } catch {}
  const check: Check = { at, ok, duration: Date.now() - start, message: ok ? "Purchasing and storage available" : "Purchasing health check failed" };
  const checkKey = `check:${at.slice(0, 16)}`;
  await env.STATE.put(checkKey, JSON.stringify(check), { expirationTtl: 7 * 86400 });
  const send = async (id: string, message: string) => {
    if (await env.STATE.get(`sent:${id}`)) return true;
    try {
      const result = await fetcher(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Fuji Purchasing: ${message}`, eventId: id, occurredAt: at, app: origin.origin }), redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!result.ok) return false;
      await env.STATE.put(`sent:${id}`, at, { expirationTtl: 35 * 86400 }); return true;
    } catch { return false; }
  };
  let incident = await env.STATE.get("active-outage");
  if (!ok) {
    if (!incident) { incident = at; await env.STATE.put("active-outage", incident); }
    await send(`outage:${incident}`, "The app is unavailable. Please investigate.");
    return;
  }
  if (incident) { await send(`recovered:${incident}`, "The app is available again."); await env.STATE.delete("active-outage"); }
  const queue = await env.STATE.list({ prefix: "check:", limit: 180 });
  const stored = await Promise.all(queue.keys.map(async key => ({ key: key.name, value: await env.STATE.get(key.name) })));
  const pending = stored.filter(r => r.value).map(r => JSON.parse(r.value!) as Check);
  const invoke = (input: unknown) => fetcher(new URL("/api/operations/run", origin), { method: "POST", headers: { ...headers, "Content-Type": "application/json", Authorization: `Bearer ${env.APP_OPERATIONS_TOKEN}` }, body: JSON.stringify(input), redirect: "error", signal: AbortSignal.timeout(25_000) });
  const response = await invoke({ action: "tick", checks: pending });
  if (!response.ok) throw new Error("Operations callback failed. Pending checks will retry on the next minute.");
  const result = await response.json() as { alerts: { id: string; kind: string; data: string }[] };
  await Promise.all(stored.map(row => env.STATE.delete(row.key)));
  for (const alert of result.alerts) {
    const details = JSON.parse(alert.data) as { message?: string };
    if (await send(alert.id, details.message || alert.kind)) await invoke({ action: "acknowledge", id: alert.id });
  }
}
export default {
  async scheduled(_event: ScheduledController, env: MonitorEnv, ctx: ExecutionContext) { ctx.waitUntil(monitor(env)); },
  async fetch() { return Response.json({ service: "Fuji purchasing operations" }); },
};
