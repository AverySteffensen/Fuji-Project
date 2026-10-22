import {
  body,
  context,
  getPurchase,
  writePurchase,
  json,
  handleError,
} from "@/lib/purchasing/server";
import {
  approve,
  reject,
  resubmit,
  saveOrder,
  canView,
  BusinessError,
  hasRole,
} from "@/lib/purchasing/domain";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { me, members } = await context(req);
    const input = await body(req);
    const p = await getPurchase(id);
    if (!canView(me, p))
      throw new BusinessError("You cannot access this request.", 403);
    if (input.version !== p.version)
      throw new BusinessError(
        "This proposal has changed. Refresh before continuing.",
        409,
      );
    const at = new Date().toISOString();
    let next = p,
      action = "Updated",
      note = String(input.note ?? "").slice(0, 2000);
    if (input.action === "approve") {
      next = approve(p, me, at, note);
      action = next.status === "Approved" ? "Final approval" : "Approved step";
    } else if (input.action === "reject") {
      next = reject(p, me, at, note);
      action = "Rejected";
    } else if (input.action === "resubmit") {
      next = resubmit(p, me, input.fields, at);
      action = "Revised and resubmitted";
      note = `Revision ${p.revision} retained in audit history with its complete proposal and approvals.`;
      if (next.emergency) {
        const m = members.find((m) => m.id === next.verbalApproverId);
        if (
          !m ||
          !(next.emergencyCategory === "Production"
            ? hasRole(m, "plantmanager")
            : hasRole(m, "controller", "vicepresident"))
        )
          throw new BusinessError(
            "Select an authorized emergency verbal approver.",
          );
        next.verbalApproverName = m.name;
      }
    } else if (input.action === "order") {
      next = saveOrder(p, me, input.order, at);
      action = "Order updated";
      note = `PO ${next.order?.poNumber}; ordered ${next.order?.orderedAt}.`;
    } else throw new BusinessError("Unknown action.");
    await writePurchase(
      next,
      {
        id: crypto.randomUUID(),
        requestId: id,
        action,
        actorId: me.id,
        actorName: me.name,
        at,
        note,
        revision: next.revision,
        ...(input.action === "resubmit" ? { previousVersion: p } : {}),
      },
      p.version,
    );
    return json(next);
  } catch (e) {
    return handleError(e);
  }
}
