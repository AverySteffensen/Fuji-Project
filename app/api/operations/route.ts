import { env } from "cloudflare:workers";
import {
  body,
  context,
  database,
  handleError,
  json,
} from "@/lib/purchasing/server";
import { BusinessError, hasRole } from "@/lib/purchasing/domain";
import {
  runStep,
  startBackup,
  startRestore,
  discoverBackups,
} from "@/lib/purchasing/operations";
import {
  operationsSummary,
  recordFailureAlerts,
} from "@/lib/purchasing/monitoring";
async function authorize(req: Request) {
  const { me } = await context(req);
  if (!hasRole(me, "admin") || me.demo)
    throw new BusinessError(
      "Only the workspace owner can manage backups and monitoring.",
      403,
    );
  if (!env.BUCKET)
    throw new BusinessError("File storage is not connected.", 503);
  return me;
}
export async function GET(req: Request) {
  try {
    await authorize(req);
    return json(await operationsSummary(database()));
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(req: Request) {
  try {
    const me = await authorize(req);
    const input = await body(req);
    const db = database();
    const bucket = env.BUCKET!;
    if (input.action === "backup")
      return json({ id: await startBackup(db, me.id) }, 201);
    if (input.action === "discover")
      return json(
        await discoverBackups(
          db,
          bucket,
          typeof input.cursor === "string" ? input.cursor : undefined,
        ),
      );
    if (input.action === "step") {
      await runStep(db, bucket, String(input.id));
      return json(await operationsSummary(db));
    }
    if (input.action === "restore" || input.action === "verify") {
      const id = String(input.id);
      if (input.action === "restore" && input.confirm !== `RESTORE ${id}`)
        throw new BusinessError(
          "Enter the full confirmation shown before restoring records.",
        );
      return json(
        {
          id: await startRestore(db, bucket, id, me, input.action === "verify"),
        },
        201,
      );
    }
    throw new BusinessError("Choose a valid backup action.");
  } catch (error) {
    try {
      await recordFailureAlerts(database());
    } catch {}
    return handleError(error);
  }
}
