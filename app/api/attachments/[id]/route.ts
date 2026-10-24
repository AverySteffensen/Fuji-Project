import { env } from "cloudflare:workers";
import {
  context,
  getPurchase,
  writePurchase,
  database,
  assertSameOrigin,
  json,
  handleError,
} from "@/lib/purchasing/server";
import { canView, hasRole, BusinessError } from "@/lib/purchasing/domain";
const allowed = ["application/pdf", "image/jpeg", "image/png", "text/plain"];
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const { me } = await context(req);
    const p = await getPurchase(id);
    if (
      !canView(me, p) ||
      !(p.requesterId === me.id || hasRole(me, "accounting"))
    )
      throw new BusinessError(
        "Only the requester or Accounting can attach a file.",
        403,
      );
    if (!env.BUCKET)
      throw new BusinessError("File storage is not connected.", 503);
    if (p.attachments.length >= 10)
      throw new BusinessError("A proposal can have up to 10 attachments.");
    if (Number(req.headers.get("content-length")) > 11000000)
      throw new BusinessError("Choose a file under 10 MB.", 413);
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 10000000 ||
      !allowed.includes(file.type)
    )
      throw new BusinessError(
        "Choose a PDF, PNG, JPG, or text file under 10 MB.",
      );
    const attachment = {
      id: crypto.randomUUID(),
      name: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 150),
      size: file.size,
      type: file.type,
    };
    await env.BUCKET.put(attachment.id, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    const at = new Date().toISOString(),
      eventId = crypto.randomUUID();
    try {
      await writePurchase(
        { ...p, attachments: [...p.attachments, attachment], updatedAt: at },
        {
          id: eventId,
          requestId: id,
          action: "File attached",
          actorName: me.name,
          actorId: me.id,
          at,
          note: attachment.name,
          revision: p.revision,
        },
        p.version,
        [
          database()
            .prepare(
              "INSERT INTO attachments(id,request_id,name,type,size) SELECT ?,?,?,?,? FROM purchase_requests WHERE id=? AND json_extract(data,'$.lastMutationId')=?",
            )
            .bind(
              attachment.id,
              id,
              attachment.name,
              attachment.type,
              attachment.size,
              id,
              eventId,
            ),
        ],
      );
    } catch (e) {
      await env.BUCKET.delete(attachment.id);
      throw e;
    }
    return json(attachment, 201);
  } catch (e) {
    return handleError(e);
  }
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { me } = await context(req);
    const a = await database()
      .prepare("SELECT * FROM attachments WHERE id=?")
      .bind(id)
      .first<{
        request_id: string;
        name: string;
        type: string;
        storage_key: string | null;
      }>();
    if (!a) throw new BusinessError("File not found.", 404);
    const p = await getPurchase(a.request_id);
    if (!canView(me, p)) throw new BusinessError("Access denied.", 403);
    const obj = await env.BUCKET?.get(a.storage_key || id);
    if (!obj) throw new BusinessError("File not found.", 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": a.type,
        "Content-Disposition": `attachment; filename="${a.name.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
