import {
  DEPARTMENTS,
  type Member,
  type Purchase,
  type Audit,
} from "./types.ts";
import { approve } from "./domain.ts";
export const DEMO_MEMBERS: Member[] = [
  {
    id: "demo-employee",
    name: "Maya Thompson",
    email: "maya@example.test",
    roles: ["employee"],
    departments: ["Packaging (90)"],
    demo: true,
  },
  {
    id: "demo-employee-2",
    name: "Ethan Brooks",
    email: "ethan@example.test",
    roles: ["employee"],
    departments: ["Wash/Ag (50)"],
    demo: true,
  },
  {
    id: "demo-supervisor",
    name: "Daniel Brooks",
    email: "daniel@example.test",
    roles: ["supervisor"],
    departments: [...DEPARTMENTS],
    demo: true,
  },
  {
    id: "demo-controller",
    name: "Morgan Blake",
    email: "morgan@example.test",
    roles: ["controller"],
    departments: [],
    demo: true,
  },
  {
    id: "demo-vp",
    name: "Natalie Reed",
    email: "natalie@example.test",
    roles: ["vicepresident"],
    departments: [],
    demo: true,
  },
  {
    id: "demo-plant",
    name: "Oliver Grant",
    email: "oliver@example.test",
    roles: ["plantmanager"],
    departments: [],
    demo: true,
  },
  {
    id: "demo-treasurer",
    name: "Jordan Ellis",
    email: "jordan@example.test",
    roles: ["treasurer"],
    departments: [],
    demo: true,
  },
  {
    id: "demo-accounting",
    name: "Alex Parker",
    email: "alex@example.test",
    roles: ["accounting"],
    departments: [],
    demo: true,
  },
];
const catalog: [string, string, number, string][] = [
  ["Shrink wrap rolls", "Clearline Packaging", 60.93, "AM1-106"],
  ["Valve repair kit, 6 inch", "FlowWorks Industrial", 493.85, "JRKW360XZ"],
  ["Safety goggles, anti-fog", "Summit Safety Supply", 12.75, "SG-220"],
  ["pH calibration buffer set", "Precision Lab Supply", 86.4, "PH-SET"],
  ["Conveyor drive motor", "Atlas Process Equipment", 1875, "MTR-315"],
  ["Boiler pressure gauge", "Harbor Mechanical", 147.5, "PG-100"],
  ["Pallet jack replacement wheels", "Clearline Packaging", 72.5, "PJ-4"],
  ["Wash tank seal assembly", "FlowWorks Industrial", 530.77, "WS-361"],
  ["Silica filter media", "Pioneer Raw Materials", 268, "FM-20"],
  ["Heat-resistant gloves", "Summit Safety Supply", 18.5, "HG-40"],
  ["Air compressor service kit", "Harbor Mechanical", 385, "AC-42"],
  ["Laboratory sample bottles", "Precision Lab Supply", 4.25, "SB-500"],
  ["Dust collection cartridge", "Atlas Process Equipment", 645, "DC-18"],
  ["Forklift maintenance service", "Harbor Mechanical", 940, "SVC-FL"],
  ["Shipping label printer", "Clearline Packaging", 425, "LP-210"],
  ["Cooling pump assembly", "FlowWorks Industrial", 3260, "CP-700"],
  ["Spill containment kit", "Summit Safety Supply", 112, "SC-20"],
  ["Silica processing additive", "Pioneer Raw Materials", 720, "PA-8"],
  ["Employee workstation chair", "Oakline Office Supply", 189, "OC-12"],
  ["Dryer temperature sensor", "Atlas Process Equipment", 285, "TS-45"],
];
export function buildSeed() {
  const requests: Purchase[] = [],
    audit: Audit[] = [];
  const actor = (role: string) =>
    DEMO_MEMBERS.find((m) => m.roles.includes(role as any))!;
  for (let n = 0; n < 64; n++) {
    const c = catalog[n % catalog.length],
      quantity = n === 0 ? 40 : (n % 5) + 1;
    const d = new Date(Date.UTC(2026, 9, 22 - Math.floor(n / 3), 13, 15));
    const at = d.toISOString();
    const department =
      n % 3 === 0
        ? "Packaging (90)"
        : n % 3 === 1
          ? "Wash/Ag (50)"
          : DEPARTMENTS[n % DEPARTMENTS.length];
    const requester = n % 3 === 1 ? DEMO_MEMBERS[1] : DEMO_MEMBERS[0];
    let p: Purchase = {
      id: `sample-${String(n + 1).padStart(3, "0")}`,
      number: `PR-2026-${String(164 - n).padStart(4, "0")}`,
      title: c[0],
      requesterId: requester.id,
      requesterName: requester.name,
      department,
      purchaseType:
        n % 20 === 8 || n % 20 === 17
          ? "Raw materials"
          : n % 13 === 0
            ? "Lease"
            : "Facilities",
      priority: n % 7 === 0 ? "Rush" : "Normal",
      neededBy: new Date(d.getTime() + (7 + (n % 10)) * 86400000)
        .toISOString()
        .slice(0, 10),
      explanation: `${c[0]} needed for scheduled ${department.split(" (")[0].toLowerCase()} operations. Replace worn supplies and maintain dependable production.`,
      supplier: c[1],
      supplierReason:
        "Meets the required specification and provides a competitive lead time.",
      contactName: "Sample sales representative",
      contactEmail: "sales@example.test",
      contactPhone: "",
      quoteNumber: `Q-26-${8100 + n}`,
      projectManager: "",
      items: [
        { description: c[0], partNumber: c[3], quantity, unitPrice: c[2] },
      ],
      quotes: [
        {
          vendor: c[1],
          number: `Q-26-${8100 + n}`,
          amount: Math.round(c[2] * quantity * 100) / 100,
        },
      ],
      tax: 0,
      freight: 0,
      total: Math.round(c[2] * quantity * 100) / 100,
      status: "Pending",
      approvals: [],
      rejectionReason: "",
      submittedAt: at,
      updatedAt: at,
      approvedAt: "",
      revision: 1,
      version: 1,
      supervisorUnavailable: false,
      emergency: false,
      emergencyCategory: "Production",
      verbalApproverId: "",
      verbalApprovedAt: "",
      emergencyReason: "",
      attachments: [],
      order: null,
      sample: true,
    };
    if (n % 8 === 4) {
      p.items.push({
        description: "Mounting hardware set",
        partNumber: "HW-200",
        quantity: 2,
        unitPrice: 24.5,
      });
      p.total = Math.round((p.total + 49) * 100) / 100;
      p.quotes[0].amount = p.total;
    }
    if (n === 0) {
      p.referenceInspired = true;
      p.purchaseType = "Other";
      p.explanation =
        "Reference-inspired example: 40 rolls of shrink wrap at $60.93 per roll. Supplier and all workflow details are fictional.";
      p.quotes.push({
        vendor: "Harbor Packaging",
        number: "ALT-100",
        amount: 3782,
      });
    }
    if (n === 3) {
      p.emergency = true;
      p.emergencyReason =
        "Unexpected equipment interruption; emergency demonstration.";
      p.verbalApproverId = "demo-plant";
      p.verbalApproverName = actor("plantmanager").name;
      p.verbalApprovedAt = at;
      p.neededBy = at.slice(0, 10);
      p.priority = "Rush";
    }
    if (n < 12) {
      if (n % 3 === 1)
        p = approve(
          p,
          actor(
            p.purchaseType === "Raw materials" ? "plantmanager" : "supervisor",
          ),
          new Date(d.getTime() + 3600000).toISOString(),
        );
    } else if (n % 9 === 0) {
      p.status = "Rejected";
      p.rejectionReason =
        "Please attach a comparable supplier quote and confirm the exact part specification.";
      p.updatedAt = new Date(d.getTime() + 3600000).toISOString();
    } else {
      for (let step = 0; step < 3 && p.status === "Pending"; step++) {
        const role =
          p.purchaseType === "Raw materials"
            ? "controller"
            : p.total <= 150
              ? "supervisor"
              : step === 0
                ? "supervisor"
                : step === 1
                  ? "controller"
                  : "vicepresident";
        p = approve(
          p,
          actor(role),
          new Date(d.getTime() + (step + 1) * 3600000).toISOString(),
          "Sample approval",
        );
      }
      if (n % 4 !== 0) {
        const orderDate = new Date(d.getTime() + 86400000)
          .toISOString()
          .slice(0, 10);
        p.order = {
          poNumber: `DEMO-${16250 - n}`,
          accountNumber: `55${n % 10}0-50`,
          purchaserInitials: "AP",
          orderedAt: orderDate,
          carrier: n % 2 ? "UPS" : "FedEx",
          trackingNumber: `SAMPLE-${90000 + n}`,
          trackingUrl: "",
          expectedAt: new Date(d.getTime() + 4 * 86400000)
            .toISOString()
            .slice(0, 10),
          receivedAt:
            n > 23
              ? new Date(d.getTime() + 3 * 86400000).toISOString().slice(0, 10)
              : "",
          invoiceAt:
            n > 30
              ? new Date(d.getTime() + 4 * 86400000).toISOString().slice(0, 10)
              : "",
          notes: "Fictional order for demonstration only.",
        };
        p.updatedAt =
          (p.order.invoiceAt || p.order.receivedAt || p.order.orderedAt) +
          "T16:00:00Z";
      }
    }
    requests.push(p);
    audit.push({
      id: `seed-${n}-submitted`,
      requestId: p.id,
      action: "Submitted",
      actorName: p.requesterName,
      actorId: p.requesterId,
      at: p.submittedAt,
      note: "Fictional sample record.",
      revision: 1,
    });
    for (const [i, a] of p.approvals.entries())
      audit.push({
        id: `seed-${n}-approval-${i}`,
        requestId: p.id,
        action: "Approved step",
        actorName: a.actorName,
        actorId: a.actorId,
        at: a.at,
        note: a.role,
        revision: 1,
      });
    if (p.status === "Rejected")
      audit.push({
        id: `seed-${n}-reject`,
        requestId: p.id,
        action: "Rejected",
        actorName: actor("supervisor").name,
        actorId: "demo-supervisor",
        at: p.updatedAt,
        note: p.rejectionReason,
        revision: 1,
      });
    if (p.order)
      audit.push({
        id: `seed-${n}-order`,
        requestId: p.id,
        action: "Order recorded",
        actorName: actor("accounting").name,
        actorId: "demo-accounting",
        at: p.order.orderedAt + "T16:00:00Z",
        note: `PO ${p.order.poNumber}`,
        revision: 1,
      });
  }
  return { requests, audit };
}
