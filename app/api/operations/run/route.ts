import { env } from "cloudflare:workers";
import { body, database, handleError, json } from "@/lib/purchasing/server";
import { BusinessError } from "@/lib/purchasing/domain";
import { digest } from "@/lib/purchasing/auth-security";
import { operationsTick } from "@/lib/purchasing/monitoring";
export async function POST(req: Request) {
  try {
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (
      !env.FUJI_OPERATIONS_TOKEN ||
      token.length < 32 ||
      (await digest(token)) !== (await digest(env.FUJI_OPERATIONS_TOKEN))
    )
      throw new BusinessError("Service access denied.", 403);
    const input = await body(req);
    const db = database();
    if (!env.BUCKET)
      throw new BusinessError("File storage is unavailable.", 503);
    if (input.action === "acknowledge") {
      await db
        .prepare(
          "UPDATE operation_alerts SET delivered_at=? WHERE id=? AND delivered_at IS NULL",
        )
        .bind(new Date().toISOString(), String(input.id))
        .run();
      return json({ acknowledged: true });
    }
    if (
      input.action !== "tick" ||
      !Array.isArray(input.checks) ||
      input.checks.length > 180
    )
      throw new BusinessError("Invalid operations request.");
    return json(await operationsTick(db, env.BUCKET, input.checks));
  } catch (error) {
    return handleError(error);
  }
}
