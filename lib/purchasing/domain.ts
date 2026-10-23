import {
  DEPARTMENTS,
  PRIORITIES,
  type Purchase,
  type Member,
  type Role,
  type Approval,
  type Order,
} from "./types.ts";
export class BusinessError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const text = (v: unknown, max = 2000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const date = (v: unknown) => {
  const s = text(v, 10);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s))
    throw new BusinessError("Use a valid date.");
  if (
    s &&
    (Number.isNaN(Date.parse(s + "T12:00:00Z")) ||
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) !== s)
  )
    throw new BusinessError("Use a valid date.");
  return s;
};
const num = (v: unknown, min = 0, max = 100000000) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new BusinessError("Enter a valid, nonnegative amount or quantity.");
  return n;
};
export const businessDate = (instant: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
export const cents = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export const hasRole = (m: Member, ...roles: Role[]) =>
  roles.some((r) => m.roles.includes(r));
export function approvalSteps(p: Purchase): Role[][] {
  if (p.purchaseType === "Raw materials")
    return [["plantmanager", "controller"]];
  if (p.total <= 150)
    return [
      p.supervisorUnavailable ? ["treasurer", "controller"] : ["supervisor"],
    ];
  if (p.total <= 1000) return [["supervisor"], ["controller", "vicepresident"]];
  return [["supervisor"], ["controller"], ["vicepresident"]];
}
export function nextStep(p: Purchase): Role[] {
  return (
    approvalSteps(p).find(
      (step) =>
        !p.approvals.some(
          (a) => a.revision === p.revision && step.includes(a.role),
        ),
    ) ?? []
  );
}
export function canView(m: Member, p: Purchase) {
  if (m.demo && !p.sample) return false;
  return (
    m.id === p.requesterId ||
    hasRole(
      m,
      "admin",
      "accounting",
      "controller",
      "vicepresident",
      "plantmanager",
      "treasurer",
    ) ||
    (hasRole(m, "supervisor") && m.departments.includes(p.department))
  );
}
export function canApprove(m: Member, p: Purchase) {
  return (
    canView(m, p) &&
    p.status === "Pending" &&
    m.id !== p.requesterId &&
    nextStep(p).some((r) => m.roles.includes(r)) &&
    (!m.roles.includes("supervisor") ||
      !nextStep(p).includes("supervisor") ||
      m.departments.includes(p.department))
  );
}
export function sanitizeRequest(input: Record<string, any>): Partial<Purchase> {
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, 40)
    .map((i) => ({
      description: text(i.description, 250),
      partNumber: text(i.partNumber, 100),
      quantity: num(i.quantity, 0.001, 1000000),
      unitPrice: num(i.unitPrice),
    }));
  if (!items.length || items.some((i) => !i.description))
    throw new BusinessError(
      "Add at least one item with a description, quantity, and price.",
    );
  const department = text(input.department);
  if (!DEPARTMENTS.includes(department as any))
    throw new BusinessError("Select a department.");
  const purchaseType = input.purchaseType;
  if (!["Facilities", "Lease", "Other", "Raw materials"].includes(purchaseType))
    throw new BusinessError("Select a purchase type.");
  const priority = input.priority;
  if (!PRIORITIES.includes(priority))
    throw new BusinessError("Select Low, Medium, or High priority.");
  const explanation = text(input.explanation);
  const supplier = text(input.supplier, 200);
  const neededBy = date(input.neededBy);
  if (!explanation || !supplier || !neededBy)
    throw new BusinessError(
      "Business explanation, supplier, and needed-by date are required.",
    );
  const freight = cents(num(input.freight ?? 0)),
    tax = cents(num(input.tax ?? 0));
  const total = cents(
    items.reduce((s, i) => s + cents(i.quantity * i.unitPrice), 0) +
      freight +
      tax,
  );
  if (total <= 0)
    throw new BusinessError("The request total must be greater than zero.");
  const contactEmail = text(input.contactEmail, 250);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    throw new BusinessError("Enter a valid supplier email.");
  const emergency = Boolean(input.emergency),
    emergencyCategory = input.emergencyCategory === "BA" ? "BA" : "Production";
  const verbalApprovedAt = text(input.verbalApprovedAt, 40);
  if (
    emergency &&
    (!text(input.emergencyReason) ||
      !text(input.verbalApproverId) ||
      !verbalApprovedAt ||
      Number.isNaN(Date.parse(verbalApprovedAt)))
  )
    throw new BusinessError(
      "Emergency requests need a reason, verbal approver, and approval date/time.",
    );
  if (emergency) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(verbalApprovedAt))
      throw new BusinessError("Use a valid verbal approval date and time.");
    date(verbalApprovedAt.slice(0, 10));
  }
  if (emergency && Date.parse(verbalApprovedAt) > Date.now() + 60000)
    throw new BusinessError("Verbal approval cannot be in the future.");
  return {
    title: items[0].description,
    department,
    purchaseType,
    priority,
    neededBy,
    explanation,
    supplier,
    supplierReason: text(input.supplierReason),
    contactName: text(input.contactName, 200),
    contactEmail,
    contactPhone: text(input.contactPhone, 100),
    quoteNumber: text(input.quoteNumber, 100),
    projectManager: text(input.projectManager, 200),
    items,
    freight,
    tax,
    total,
    quotes: (Array.isArray(input.quotes) ? input.quotes : [])
      .slice(0, 3)
      .filter((q) => text(q.vendor))
      .map((q) => ({
        vendor: text(q.vendor, 200),
        number: text(q.number, 100),
        amount: cents(num(q.amount)),
      })),
    supervisorUnavailable: total <= 150 && Boolean(input.supervisorUnavailable),
    emergency,
    emergencyCategory,
    verbalApprovedAt: emergency ? verbalApprovedAt : "",
    verbalApproverId: emergency ? text(input.verbalApproverId) : "",
    emergencyReason: emergency ? text(input.emergencyReason) : "",
  };
}
export function approve(
  p: Purchase,
  m: Member,
  now: string,
  note = "",
): Purchase {
  if (!canApprove(m, p))
    throw new BusinessError(
      "You are not authorized for the next approval step.",
      403,
    );
  const role = nextStep(p).find((r) => m.roles.includes(r))!;
  const approvals: Approval[] = [
    ...p.approvals,
    {
      role,
      actorId: m.id,
      actorName: m.name,
      at: now,
      note: text(note),
      revision: p.revision,
    },
  ];
  const next = { ...p, approvals };
  const complete = nextStep(next).length === 0;
  return {
    ...next,
    status: complete ? "Approved" : "Pending",
    approvedAt: complete ? now : "",
    updatedAt: now,
  };
}
export function reject(
  p: Purchase,
  m: Member,
  now: string,
  reason: string,
): Purchase {
  if (!canApprove(m, p))
    throw new BusinessError(
      "You are not authorized to reject this request.",
      403,
    );
  if (!text(reason))
    throw new BusinessError("A reason is required when rejecting a proposal.");
  return {
    ...p,
    status: "Rejected",
    rejectionReason: text(reason),
    approvedAt: "",
    updatedAt: now,
  };
}
export function resubmit(
  p: Purchase,
  m: Member,
  input: Record<string, any>,
  now: string,
): Purchase {
  if (p.requesterId !== m.id || p.status !== "Rejected")
    throw new BusinessError(
      "Only the requester can revise a rejected proposal.",
      403,
    );
  return {
    ...p,
    ...sanitizeRequest(input),
    status: "Pending",
    approvals: [],
    approvedAt: "",
    rejectionReason: "",
    revision: p.revision + 1,
    submittedAt: now,
    updatedAt: now,
    order: null,
  };
}
export function saveOrder(
  p: Purchase,
  m: Member,
  input: Record<string, any>,
  now: string,
): Purchase {
  if (!hasRole(m, "accounting"))
    throw new BusinessError(
      "Only Accounting can enter purchase order information.",
      403,
    );
  if (p.status === "Rejected")
    throw new BusinessError(
      "Rejected proposals cannot be ordered. Revise and obtain fresh approvals.",
    );
  if (p.status !== "Approved" && !p.emergency)
    throw new BusinessError("Complete all approvals before placing an order.");
  const poNumber = text(input.poNumber, 100),
    orderedAt = date(input.orderedAt);
  if (!poNumber || !orderedAt)
    throw new BusinessError("PO number and order date are required.");
  if (orderedAt > businessDate(now))
    throw new BusinessError("Order date cannot be in the future.");
  if (!p.emergency && orderedAt < businessDate(p.approvedAt))
    throw new BusinessError("Order date cannot precede final approval.");
  if (p.emergency && orderedAt < businessDate(p.verbalApprovedAt))
    throw new BusinessError(
      "Order date cannot precede emergency verbal approval.",
    );
  const trackingUrl = text(input.trackingUrl, 1000);
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl))
    throw new BusinessError("Tracking links must start with https://.");
  const receivedAt = date(input.receivedAt),
    invoiceAt = date(input.invoiceAt);
  if (receivedAt && (receivedAt < orderedAt || receivedAt > businessDate(now)))
    throw new BusinessError(
      "Received date must be between the order date and today.",
    );
  if (invoiceAt && invoiceAt > businessDate(now))
    throw new BusinessError("Invoice date cannot be in the future.");
  const order: Order = {
    poNumber,
    orderedAt,
    accountNumber: text(input.accountNumber, 100),
    purchaserInitials: text(input.purchaserInitials, 20),
    carrier: text(input.carrier, 100),
    trackingNumber: text(input.trackingNumber, 200),
    trackingUrl,
    expectedAt: date(input.expectedAt),
    receivedAt,
    invoiceAt,
    notes: text(input.notes),
  };
  return { ...p, order, updatedAt: now };
}
export function emergencyDue(p: Purchase) {
  return p.emergency
    ? new Date(Date.parse(p.verbalApprovedAt) + 86400000).toISOString()
    : "";
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function exportRows(purchases: Purchase[], lineItems = false) {
  const head = [
    "Request ID",
    "Revision",
    "Sample data",
    "Requester",
    "Department",
    "Priority",
    "Purchase type",
    "Item",
    "Part number",
    "Quantity",
    "Unit price",
    "Line total",
    "Request total",
    "Freight",
    "Tax",
    "Supplier",
    "Quote number",
    "Supplier reason",
    "Contact name",
    "Contact email",
    "Contact phone",
    "Project manager",
    "Explanation",
    "Status",
    "Submitted at",
    "Needed by",
    "Approved at",
    "Supervisor approval",
    "Controller approval",
    "VP approval",
    "Other approvals",
    "PO number",
    "Account number",
    "Purchaser initials",
    "Ordered on",
    "Carrier",
    "Tracking number",
    "Tracking URL",
    "Expected on",
    "Received on",
    "Invoice to accounting",
    "Rejection reason",
    "Emergency",
    "Verbal approved at",
    "Verbal approver",
    "Emergency category",
    "Emergency reason",
    "Supervisor absent",
    "Order notes",
    "Attachments",
    "Quote 1 vendor",
    "Quote 1 number",
    "Quote 1 amount",
    "Quote 2 vendor",
    "Quote 2 number",
    "Quote 2 amount",
    "Quote 3 vendor",
    "Quote 3 number",
    "Quote 3 amount",
  ];
  return [
    head,
    ...purchases.flatMap((p) =>
      (lineItems
        ? p.items
        : [
            {
              description: p.items.map((i) => i.description).join("; "),
              partNumber: p.items
                .map((i) => i.partNumber)
                .filter(Boolean)
                .join("; "),
              quantity: "",
              unitPrice: "",
              lineTotal: "",
            },
          ]
      ).map((i: any) => [
        p.number,
        p.revision,
        p.sample ? "Yes" : "No",
        p.requesterName,
        p.department,
        p.priority,
        p.purchaseType,
        i.description,
        i.partNumber,
        i.quantity,
        i.unitPrice,
        lineItems ? cents(i.quantity * i.unitPrice) : "",
        p.total,
        p.freight,
        p.tax,
        p.supplier,
        p.quoteNumber,
        p.supplierReason,
        p.contactName,
        p.contactEmail,
        p.contactPhone,
        p.projectManager,
        p.explanation,
        p.status,
        p.submittedAt,
        p.neededBy,
        p.approvedAt,
        ...(["supervisor", "controller", "vicepresident"] as Role[]).map((r) =>
          p.approvals
            .filter((a) => a.role === r)
            .map((a) => `${a.actorName} | ${a.at}`)
            .join("; "),
        ),
        p.approvals
          .filter(
            (a) =>
              !["supervisor", "controller", "vicepresident"].includes(a.role),
          )
          .map((a) => `${a.role}: ${a.actorName} | ${a.at}`)
          .join("; "),
        p.order?.poNumber ?? "",
        p.order?.accountNumber ?? "",
        p.order?.purchaserInitials ?? "",
        p.order?.orderedAt ?? "",
        p.order?.carrier ?? "",
        p.order?.trackingNumber ?? "",
        p.order?.trackingUrl ?? "",
        p.order?.expectedAt ?? "",
        p.order?.receivedAt ?? "",
        p.order?.invoiceAt ?? "",
        p.rejectionReason,
        p.emergency ? "Yes" : "No",
        p.verbalApprovedAt,
        p.verbalApproverName ?? p.verbalApproverId,
        p.emergency ? p.emergencyCategory : "",
        p.emergencyReason,
        p.supervisorUnavailable ? "Yes" : "No",
        p.order?.notes ?? "",
        p.attachments.map((a) => a.name).join("; "),
        ...[0, 1, 2].flatMap((n) => [
          p.quotes[n]?.vendor ?? "",
          p.quotes[n]?.number ?? "",
          p.quotes[n]?.amount ?? "",
        ]),
      ]),
    ),
  ];
}
export const toCSV = (rows: unknown[][]) =>
  "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
