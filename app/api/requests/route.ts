import {
  body,
  context,
  writePurchase,
  json,
  handleError,
} from "@/lib/purchasing/server";
import {
  sanitizeRequest,
  BusinessError,
  hasRole,
} from "@/lib/purchasing/domain";
import type { Purchase } from "@/lib/purchasing/types";
export async function POST(req: Request) {
  try {
    const { me, members } = await context(req);
    const input = await body(req);
    const fields = sanitizeRequest(input);
    const at = new Date().toISOString();
    if (fields.emergency) {
      const m = members.find((m) => m.id === fields.verbalApproverId);
      if (
        !m ||
        !(fields.emergencyCategory === "Production"
          ? hasRole(m, "plantmanager")
          : hasRole(m, "controller", "vicepresident"))
      )
        throw new BusinessError(
          "Select an authorized emergency verbal approver.",
        );
      fields.verbalApproverName = m.name;
    }
    const id = crypto.randomUUID();
    const p = {
      ...fields,
      id,
      number: `PR-${at.slice(0, 4)}-${id.slice(0, 8).toUpperCase()}`,
      requesterId: me.id,
      requesterName: me.name,
      status: "Pending",
      approvals: [],
      rejectionReason: "",
      submittedAt: at,
      updatedAt: at,
      approvedAt: "",
      revision: 1,
      version: 1,
      attachments: [],
      order: null,
      sample: me.demo,
    } as Purchase;
    await writePurchase(p, {
      id: crypto.randomUUID(),
      requestId: id,
      action: "Submitted",
      actorId: me.id,
      actorName: me.name,
      at,
      note: fields.emergency
        ? "Emergency verbal approval recorded. Written sign-off due within one day."
        : "Purchase proposal submitted.",
      revision: 1,
    });
    return json(p, 201);
  } catch (e) {
    return handleError(e);
  }
}
