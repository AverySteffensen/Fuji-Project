import { context, database, handleError } from "@/lib/purchasing/server";
import { BusinessError } from "@/lib/purchasing/domain";
import { readFilters, registerQuery } from "@/lib/purchasing/register-server";
import { createXlsx, purchaseSheets, XLSX_MIME } from "@/lib/purchasing/xlsx";
import type { Purchase, Audit } from "@/lib/purchasing/types";
export async function GET(req: Request) {
  try {
    const ctx = await context(req);
    const db = database();
    const filters = readFilters(new URL(req.url));
    const q = registerQuery(ctx.me, filters);
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM request_index i WHERE ${q.where}`)
      .bind(...q.values)
      .first<{ n: number }>();
    if ((count?.n ?? 0) > 25_000)
      throw new BusinessError(
        "Narrow the date range to export up to 25,000 requests at a time.",
      );
    const records = await db
      .prepare(
        `SELECT p.data FROM request_index i JOIN purchase_requests p ON p.id=i.id WHERE ${q.where} ORDER BY ${q.order}`,
      )
      .bind(...q.values)
      .all<{ data: string }>();
    const events = await db
      .prepare(
        `SELECT a.data FROM audit_events a JOIN request_index i ON i.id=a.request_id WHERE ${q.where} ORDER BY a.at DESC`,
      )
      .bind(...q.values)
      .all<{ data: string }>();
    const requests = records.results.map((r) => JSON.parse(r.data) as Purchase);
    const audit = events.results.map((r) => JSON.parse(r.data) as Audit);
    const workbook = createXlsx(
      purchaseSheets(
        requests,
        {
          me: ctx.me,
          owner: ctx.owner,
          actors: [],
          members: [],
          requests,
          audit,
          demoMode: ctx.me.demo,
        },
        filters,
      ),
    );
    return new Response(workbook, {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": 'attachment; filename="fuji-purchases.xlsx"',
        "Cache-Control": "private, no-store",
        "X-Export-Count": String(requests.length),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
