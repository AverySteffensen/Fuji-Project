import {
  body,
  context,
  findPurchase,
  writePurchase,
  json,
  handleError,
} from "@/lib/purchasing/server";
import {
  sanitizeRequest,
  snapshotApprovalRoute,
  BusinessError,
  hasRole,
} from "@/lib/purchasing/domain";
import type { Purchase } from "@/lib/purchasing/types";

async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function POST(req: Request) {
  try {
    const { me, members } = await context(req);
    const input = await body(req);
    const fields: ReturnType<typeof sanitizeRequest> &
      Pick<Purchase, "verbalApproverName"> = sanitizeRequest(input);
    const key = req.headers.get("Idempotency-Key")?.toLowerCase() ?? "";
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        key,
      )
    )
      throw new BusinessError(
        "Refresh the form before submitting a new request.",
      );
    const [identity, submissionFingerprint] = await Promise.all([
      digest(["fuji-submission-v1", me.id, key]),
      digest(fields),
    ]);
    // Reusing the actor-scoped ID makes the insert, audit event and index atomic.
    const id = `submission-${identity.slice(0, 32)}`;
    const replay = (existing: Purchase) => {
      if (
        existing.requesterId !== me.id ||
        existing.submissionFingerprint !== submissionFingerprint
      )
        throw new BusinessError(
          "This submission was already used for a different draft. Check your requests before starting a new one.",
          409,
        );
      return json(existing);
    };
    const existing = await findPurchase(id);
    if (existing) return replay(existing);
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
    const p = {
      ...fields,
      id,
      number: `PR-${at.slice(0, 4)}-${identity.slice(0, 8).toUpperCase()}`,
      requesterId: me.id,
      requesterName: me.name,
      status: "Pending",
      approvals: [],
      approvalRoute: snapshotApprovalRoute(fields),
      rejectionReason: "",
      submittedAt: at,
      updatedAt: at,
      approvedAt: "",
      revision: 1,
      version: 1,
      attachments: [],
      order: null,
      sample: me.demo,
      submissionFingerprint,
    } as Purchase;
    const saved = await writePurchase(p, {
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
    return saved === p ? json(saved, 201) : replay(saved);
  } catch (e) {
    return handleError(e);
  }
}
