import { env } from "cloudflare:workers";
import { digest } from "@/lib/purchasing/crypto";
import { BusinessError } from "@/lib/purchasing/domain";
import { runDailyBackup } from "@/lib/purchasing/monitoring";
import { database, handleError, json } from "@/lib/purchasing/server";

// The Site gateway consumes its access bearer. This independent check grants
// only the ability to advance today's backup, even if Site sharing changes.
export async function POST(request: Request) {
  try {
    const proof = request.headers.get("X-Fuji-Backup-Proof") ?? "";
    const verifier = env.FUJI_DAILY_BACKUP_VERIFIER;
    if (
      !verifier ||
      !/^[0-9a-f]{64}$/.test(proof) ||
      (await digest(proof)) !== verifier
    )
      throw new BusinessError("Daily backup authorization required.", 403);
    if (!env.BUCKET)
      throw new BusinessError("Backup storage is unavailable.", 503);
    const result = await runDailyBackup(database(), env.BUCKET);
    return json(result, result.status === "complete" ? 200 : 202);
  } catch (error) {
    return handleError(error);
  }
}
