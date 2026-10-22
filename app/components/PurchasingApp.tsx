"use client";
import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  ShieldCheck,
  History,
  BarChart3,
  BookOpen,
  Users,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Clock,
  Package,
  Truck,
  FileText,
  Leaf,
  ArrowRight,
  RotateCcw,
  Paperclip,
  Printer,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Menu,
  SlidersHorizontal,
  Building2,
  Send,
  Trash2,
} from "lucide-react";
import {
  DEPARTMENTS,
  ROLE_NAMES,
  type Workspace,
  type Purchase,
  type Member,
  type Order,
  type Role,
} from "@/lib/purchasing/types";
import {
  money,
  canApprove,
  approvalSteps,
  nextStep,
  hasRole,
  exportRows,
  toCSV,
  emergencyDue,
  businessDate,
} from "@/lib/purchasing/domain";
const views = [
  ["overview", "Overview", LayoutDashboard],
  ["requests", "Purchase requests", ClipboardList],
  ["approvals", "Approvals", ShieldCheck],
  ["history", "Purchase history", History],
  ["reports", "Reports & exports", BarChart3],
  ["policy", "Purchasing policy", BookOpen],
  ["people", "People & access", Users],
] as const;
const fmt = (s: string, time = false) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00Z" : s).toLocaleDateString(
        "en-US",
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
          timeZone: "America/New_York",
        },
      )
    : "—";
const initials = (s: string) =>
  s
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const shortDept = (s: string) => s.replace(/ \(\d+\)/, "");
function Badge({ value }: { value: string }) {
  return (
    <span className={"badge " + value.toLowerCase().replaceAll(" ", "-")}>
      {value === "Pending" ? (
        <Clock size={11} />
      ) : value === "Approved" ? (
        <CheckCircle2 size={11} />
      ) : value === "Rejected" ? (
        <X size={11} />
      ) : null}
      {value}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", fn);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const blank = () => ({
  department: "Packaging (90)",
  purchaseType: "Facilities",
  priority: "Normal",
  neededBy: businessDate(new Date(Date.now() + 7 * 86400000).toISOString()),
  explanation: "",
  supplier: "",
  supplierReason: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  quoteNumber: "",
  projectManager: "",
  items: [{ description: "", partNumber: "", quantity: 1, unitPrice: 0 }],
  quotes: [] as { vendor: string; number: string; amount: number }[],
  tax: 0,
  freight: 0,
  supervisorUnavailable: false,
  emergency: false,
  emergencyCategory: "Production",
  verbalApproverId: "",
  verbalApprovedAt: "",
  emergencyReason: "",
});
function RequestForm({
  source,
  revision,
  me,
  members,
  onClose,
  onSave,
  busy,
}: {
  source?: Purchase;
  revision: boolean;
  me: Member;
  members: Member[];
  onClose: () => void;
  onSave: (v: any) => Promise<void>;
  busy: boolean;
}) {
  const [f, setF] = useState<any>(() =>
    source
      ? {
          ...source,
          neededBy: revision ? source.neededBy : blank().neededBy,
          emergency: revision ? source.emergency : false,
        }
      : blank(),
  );
  const [error, setError] = useState("");
  const field = (name: string, value: any) =>
    setF((p: any) => ({ ...p, [name]: value }));
  const total =
    Math.round(
      (f.items.reduce(
        (s: number, i: any) =>
          s + Math.round(Number(i.quantity) * Number(i.unitPrice) * 100) / 100,
        0,
      ) +
        Number(f.tax) +
        Number(f.freight)) *
        100,
    ) / 100;
  const preview = { ...f, total, approvals: [], revision: 1 } as Purchase;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onSave(f);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={
        revision
          ? "Revise purchase proposal"
          : source
            ? "Reorder from past purchase"
            : "New purchase request"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body form-body">
          <div className="form-intro">
            <span className="overline">PURCHASE PROPOSAL</span>
            <p>A complete request gives your approvers everything they need.</p>
            <small>
              Submitting as <strong>{me.name}</strong> · Fields marked * are
              required
            </small>
          </div>
          <h3 className="section-label">
            <span>01</span> Request details
          </h3>
          <div className="form-grid cols-2">
            <label>
              Department *
              <select
                value={f.department}
                onChange={(e) => field("department", e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Date needed by *
              <input
                type="date"
                required
                value={f.neededBy}
                onChange={(e) => field("neededBy", e.target.value)}
              />
            </label>
            <label>
              Purchase type *
              <select
                value={f.purchaseType}
                onChange={(e) => field("purchaseType", e.target.value)}
              >
                {["Facilities", "Lease", "Other", "Raw materials"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Priority *
              <select
                value={f.priority}
                onChange={(e) => field("priority", e.target.value)}
              >
                <option>Normal</option>
                <option>Rush</option>
              </select>
            </label>
          </div>
          <h3 className="section-label">
            <span>02</span> Items to purchase
          </h3>
          <div className="line-editor">
            {f.items.map((item: any, i: number) => (
              <div className="item-edit" key={i}>
                <label>
                  Item description *
                  <input
                    required
                    maxLength={250}
                    placeholder="e.g. Valve repair kit, 6 inch"
                    value={item.description}
                    onChange={(e) =>
                      field(
                        "items",
                        f.items.map((v: any, j: number) =>
                          j === i ? { ...v, description: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Part / item number
                  <input
                    value={item.partNumber}
                    onChange={(e) =>
                      field(
                        "items",
                        f.items.map((v: any, j: number) =>
                          j === i ? { ...v, partNumber: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Quantity *
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={item.quantity}
                    onChange={(e) =>
                      field(
                        "items",
                        f.items.map((v: any, j: number) =>
                          j === i ? { ...v, quantity: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Unit price ($) *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(e) =>
                      field(
                        "items",
                        f.items.map((v: any, j: number) =>
                          j === i ? { ...v, unitPrice: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove item ${i + 1}`}
                  disabled={f.items.length === 1}
                  onClick={() =>
                    field(
                      "items",
                      f.items.filter((_: any, j: number) => j !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="row spread">
            <button
              className="text-btn"
              type="button"
              disabled={f.items.length >= 40}
              onClick={() =>
                field("items", [
                  ...f.items,
                  {
                    description: "",
                    partNumber: "",
                    quantity: 1,
                    unitPrice: 0,
                  },
                ])
              }
            >
              <Plus size={15} />
              Add another item
            </button>
            <div className="extra-costs">
              <label>
                Freight ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.freight}
                  onChange={(e) => field("freight", e.target.value)}
                />
              </label>
              <label>
                Tax ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.tax}
                  onChange={(e) => field("tax", e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="estimate">
            <span>Estimated purchase total</span>
            <strong>{money(total || 0)}</strong>
          </div>
          <h3 className="section-label">
            <span>03</span> Supplier & business purpose
          </h3>
          <div className="form-grid cols-2">
            <label>
              Supplier name *
              <input
                required
                maxLength={200}
                placeholder="Company name"
                value={f.supplier}
                onChange={(e) => field("supplier", e.target.value)}
              />
            </label>
            <label>
              Quote number <em>if applicable</em>
              <input
                value={f.quoteNumber}
                onChange={(e) => field("quoteNumber", e.target.value)}
              />
            </label>
            <label>
              Contact person
              <input
                value={f.contactName}
                onChange={(e) => field("contactName", e.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                value={f.contactEmail}
                onChange={(e) => field("contactEmail", e.target.value)}
              />
            </label>
            <label>
              Contact phone
              <input
                type="tel"
                value={f.contactPhone}
                onChange={(e) => field("contactPhone", e.target.value)}
              />
            </label>
            <label>
              Project manager
              <input
                value={f.projectManager}
                onChange={(e) => field("projectManager", e.target.value)}
              />
            </label>
          </div>
          <label>
            Brief explanation: purpose & contents *
            <textarea
              required
              rows={3}
              maxLength={2000}
              placeholder="What is being purchased, and why is it needed?"
              value={f.explanation}
              onChange={(e) => field("explanation", e.target.value)}
            />
          </label>
          <label>
            Reason for selecting this supplier
            <textarea
              rows={2}
              value={f.supplierReason}
              onChange={(e) => field("supplierReason", e.target.value)}
            />
          </label>
          <div className="row spread">
            <h3 className="section-label">
              <span>04</span> Competitive quotes <em>optional · up to 3</em>
            </h3>
            <button
              type="button"
              className="text-btn"
              disabled={f.quotes.length >= 3}
              onClick={() =>
                field("quotes", [
                  ...f.quotes,
                  { vendor: "", number: "", amount: 0 },
                ])
              }
            >
              <Plus size={15} />
              Add quote
            </button>
          </div>
          {f.quotes.map((q: any, i: number) => (
            <div className="quote-edit" key={i}>
              <label>
                Vendor {i + 1}
                <input
                  value={q.vendor}
                  onChange={(e) =>
                    field(
                      "quotes",
                      f.quotes.map((v: any, j: number) =>
                        i === j ? { ...v, vendor: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Quote #
                <input
                  value={q.number}
                  onChange={(e) =>
                    field(
                      "quotes",
                      f.quotes.map((v: any, j: number) =>
                        i === j ? { ...v, number: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Quoted price ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={q.amount}
                  onChange={(e) =>
                    field(
                      "quotes",
                      f.quotes.map((v: any, j: number) =>
                        i === j ? { ...v, amount: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove quote ${i + 1}`}
                onClick={() =>
                  field(
                    "quotes",
                    f.quotes.filter((_: any, j: number) => i !== j),
                  )
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="exceptions">
            <h3>Special circumstances</h3>
            {total <= 150 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={f.supervisorUnavailable}
                  onChange={(e) =>
                    field("supervisorUnavailable", e.target.checked)
                  }
                />
                Immediate supervisor is unavailable
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={f.emergency}
                onChange={(e) => field("emergency", e.target.checked)}
              />
              Emergency purchase with prior verbal approval
            </label>
            {f.emergency && (
              <div className="form-grid cols-2">
                <p className="span-2 hint">
                  Written approvals are due within one day of the emergency.
                  Record who gave verbal approval and when.
                </p>
                <label>
                  Emergency category
                  <select
                    value={f.emergencyCategory}
                    onChange={(e) => {
                      field("emergencyCategory", e.target.value);
                      field("verbalApproverId", "");
                    }}
                  >
                    <option>Production</option>
                    <option>BA</option>
                  </select>
                </label>
                <label>
                  Verbal approver *
                  <select
                    required
                    value={f.verbalApproverId}
                    onChange={(e) => field("verbalApproverId", e.target.value)}
                  >
                    <option value="">Select approver</option>
                    {members
                      .filter((m) =>
                        f.emergencyCategory === "Production"
                          ? m.roles.includes("plantmanager")
                          : hasRole(m, "controller", "vicepresident"),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Verbal approval date & time *
                  <input
                    required
                    type="datetime-local"
                    value={f.verbalApprovedAt.slice(0, 16)}
                    onChange={(e) =>
                      field(
                        "verbalApprovedAt",
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      )
                    }
                  />
                </label>
                <label>
                  Emergency reason *
                  <input
                    required
                    value={f.emergencyReason}
                    onChange={(e) => field("emergencyReason", e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="route-preview">
            <ShieldCheck size={20} />
            <div>
              <strong>Your approval route</strong>
              <p>
                {approvalSteps(preview)
                  .map((step) => step.map((r) => ROLE_NAMES[r]).join(" or "))
                  .join(" → ")}
              </p>
            </div>
          </div>
          <p className="hint">
            Quote documents can be attached after submitting. Accounting adds
            the PO number after approval.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            <Send size={16} />
            {busy
              ? "Submitting…"
              : revision
                ? "Resubmit proposal"
                : "Submit request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function OrderForm({
  p,
  busy,
  onClose,
  onSave,
}: {
  p: Purchase;
  busy: boolean;
  onClose: () => void;
  onSave: (o: Order) => Promise<void>;
}) {
  const [o, setO] = useState<Order>(
    p.order ?? {
      poNumber: "",
      accountNumber: "",
      purchaserInitials: "",
      orderedAt: businessDate(new Date().toISOString()),
      carrier: "",
      trackingNumber: "",
      trackingUrl: "",
      expectedAt: "",
      receivedAt: "",
      invoiceAt: "",
      notes: "",
    },
  );
  const [error, setError] = useState("");
  const field = (n: keyof Order, v: string) => setO({ ...o, [n]: v });
  const controls: [keyof Order, string, string, boolean?][] = [
    ["poNumber", "Purchase order number *", "text", true],
    ["orderedAt", "Date ordered *", "date", true],
    ["accountNumber", "Account number", "text"],
    ["purchaserInitials", "Purchaser initials", "text"],
    ["carrier", "Carrier", "text"],
    ["trackingNumber", "Tracking number", "text"],
    ["trackingUrl", "Tracking URL (https://)", "url"],
    ["expectedAt", "Expected delivery date", "date"],
    ["receivedAt", "Date received", "date"],
    ["invoiceAt", "Invoice sent to Accounting", "date"],
  ];
  return (
    <Modal title="Order & tracking details" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setError("");
            await onSave(o);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="modal-body">
          <p className="hint">
            {p.number} · {p.title}
          </p>
          {p.emergency && p.status !== "Approved" && (
            <div className="alert warning">
              Emergency order: written approvals are still required by{" "}
              {fmt(emergencyDue(p), true)}.
            </div>
          )}
          <div className="form-grid cols-2">
            {controls.map(([name, label, type, required]) => (
              <label key={name}>
                {label}
                <input
                  type={type}
                  required={required}
                  value={o[name]}
                  onChange={(e) => field(name, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            Order notes
            <textarea
              rows={3}
              value={o.notes}
              onChange={(e) => field("notes", e.target.value)}
            />
          </label>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save order details"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RequestDetail({
  p,
  w,
  busy,
  onClose,
  onAction,
  onRevise,
  onReorder,
  onOrder,
  onUpload,
  onDownload,
}: {
  p: Purchase;
  w: Workspace;
  busy: boolean;
  onClose: () => void;
  onAction: (a: string, note: string) => Promise<any>;
  onRevise: () => void;
  onReorder: () => void;
  onOrder: () => void;
  onUpload: (f: File) => Promise<void>;
  onDownload: (a: { id: string; name: string }) => Promise<void>;
}) {
  const [tab, setTab] = useState("details"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const act = async (a: string) => {
    try {
      setError("");
      await onAction(a, note);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Purchase request" onClose={onClose} wide>
      <div className="modal-body detail-body">
        <div className="detail-title">
          <div>
            <span className="overline">
              {p.number} <span className="revision">REVISION {p.revision}</span>
            </span>
            <h2>{p.title}</h2>
            <p>
              {p.requesterName} <span>·</span> {p.department} <span>·</span>{" "}
              Submitted {fmt(p.submittedAt)}
            </p>
          </div>
          <div className="detail-amount">
            {money(p.total)}
            <div>
              <Badge value={p.status} />
              {p.priority === "Rush" && <Badge value="Rush" />}
            </div>
          </div>
        </div>
        {p.sample && (
          <div className="sample-note">
            <span className="sample-dot" /> Fictional sample record
            {p.referenceInspired
              ? " · Item and amount inspired by the supplied shrink-wrap example. All workflow details are simulated."
              : ". Names, suppliers, dates, and orders are for demonstration."}
          </div>
        )}
        <div className="date-strip">
          <div>
            <span>Needed by</span>
            <strong>{fmt(p.neededBy)}</strong>
          </div>
          <div>
            <span>Final approval</span>
            <strong>{fmt(p.approvedAt, true)}</strong>
          </div>
          <div>
            <span>Date ordered</span>
            <strong>{fmt(p.order?.orderedAt ?? "")}</strong>
          </div>
          <div>
            <span>Purchase order</span>
            <strong>{p.order?.poNumber || "Not assigned"}</strong>
          </div>
        </div>
        {p.status === "Rejected" && (
          <div className="alert error">
            <strong>Proposal rejected</strong>
            <p>{p.rejectionReason}</p>
            {p.requesterId === w.me.id && (
              <button className="btn" onClick={onRevise}>
                <RotateCcw size={15} />
                Revise & resubmit
              </button>
            )}
          </div>
        )}
        {p.emergency && (
          <div className="alert warning">
            <strong>Emergency purchase · {p.emergencyCategory}</strong>
            <p>
              {p.emergencyReason} Verbal approval:{" "}
              {w.members.find((m) => m.id === p.verbalApproverId)?.name ||
                "Recorded approver"}{" "}
              on {fmt(p.verbalApprovedAt, true)}. Written sign-off due{" "}
              {fmt(emergencyDue(p), true)}.
            </p>
          </div>
        )}
        <div className="tab-bar" role="group" aria-label="Request view">
          <button
            aria-pressed={tab === "details"}
            className={tab === "details" ? "active" : ""}
            onClick={() => setTab("details")}
          >
            Request details
          </button>
          <button
            aria-pressed={tab === "history"}
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            Approvals & activity
          </button>
        </div>
        {tab === "details" ? (
          <>
            <h3>Items requested</h3>
            <div className="table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Item / part number</th>
                    <th className="num">Quantity</th>
                    <th className="num">Unit price</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((i, n) => (
                    <tr key={n}>
                      <td>
                        <strong>{i.description}</strong>
                        <small>{i.partNumber || "No part number"}</small>
                      </td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{money(i.unitPrice)}</td>
                      <td className="num">{money(i.unitPrice * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="total-line">
              <span>
                Freight {money(p.freight)} · Tax {money(p.tax)}
              </span>
              <strong>Total {money(p.total)}</strong>
            </div>
            <div className="detail-columns">
              <section>
                <h3>Business purpose</h3>
                <p className="prewrap">{p.explanation}</p>
                <dl>
                  <dt>Purchase type</dt>
                  <dd>{p.purchaseType}</dd>
                  <dt>Project manager</dt>
                  <dd>{p.projectManager || "—"}</dd>
                  <dt>Supervisor unavailable</dt>
                  <dd>{p.supervisorUnavailable ? "Yes" : "No"}</dd>
                </dl>
              </section>
              <section>
                <h3>Supplier information</h3>
                <strong>{p.supplier}</strong>
                <p className="prewrap">
                  {p.supplierReason || "No selection notes."}
                </p>
                <dl>
                  <dt>Quote number</dt>
                  <dd>{p.quoteNumber || "—"}</dd>
                  <dt>Contact</dt>
                  <dd>{p.contactName || "—"}</dd>
                  <dt>Email</dt>
                  <dd>{p.contactEmail || "—"}</dd>
                  <dt>Phone</dt>
                  <dd>{p.contactPhone || "—"}</dd>
                </dl>
              </section>
            </div>
            {p.quotes.length > 0 && (
              <>
                <h3>Competitive quotes</h3>
                <div className="quote-cards">
                  {p.quotes.map((q, i) => (
                    <div key={i}>
                      <span>VENDOR {i + 1}</span>
                      <strong>{q.vendor}</strong>
                      <small>{q.number || "No quote number"}</small>
                      <b>{money(q.amount)}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            <section className="attachment-section">
              <div className="row spread">
                <h3>Supporting documents</h3>
                {(p.requesterId === w.me.id || hasRole(w.me, "accounting")) && (
                  <label className="btn upload-btn">
                    <Paperclip size={15} />
                    {busy ? "Uploading…" : "Attach file"}
                    <input
                      type="file"
                      disabled={busy}
                      accept=".pdf,.jpg,.jpeg,.png,.txt"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          setError("");
                          await onUpload(f);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {p.attachments.length ? (
                p.attachments.map((a) => (
                  <button
                    className="attachment"
                    key={a.id}
                    onClick={() =>
                      onDownload(a).catch((e) => setError(e.message))
                    }
                  >
                    <FileText size={18} />
                    <span>
                      {a.name}
                      <small>{Math.ceil(a.size / 1024)} KB</small>
                    </span>
                    <ArrowDownToLine size={16} />
                  </button>
                ))
              ) : (
                <p className="hint">
                  No documents attached. PDF, JPG, PNG, and text files up to 10
                  MB are supported.
                </p>
              )}
            </section>
            {p.order && (
              <section className="order-section">
                <div className="row spread">
                  <h3>
                    <Truck size={18} /> Order & delivery
                  </h3>
                  <Badge value={p.order.receivedAt ? "Received" : "Ordered"} />
                </div>
                <dl className="order-grid">
                  <dt>PO number</dt>
                  <dd>{p.order.poNumber}</dd>
                  <dt>Account number</dt>
                  <dd>{p.order.accountNumber || "—"}</dd>
                  <dt>Purchaser initials</dt>
                  <dd>{p.order.purchaserInitials || "—"}</dd>
                  <dt>Carrier</dt>
                  <dd>{p.order.carrier || "—"}</dd>
                  <dt>Tracking number</dt>
                  <dd>
                    {p.order.trackingNumber || "—"}{" "}
                    {p.order.trackingUrl && (
                      <a
                        href={p.order.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Track shipment <ExternalLink size={12} />
                      </a>
                    )}
                  </dd>
                  <dt>Expected delivery</dt>
                  <dd>{fmt(p.order.expectedAt)}</dd>
                  <dt>Date received</dt>
                  <dd>{fmt(p.order.receivedAt)}</dd>
                  <dt>Invoice to Accounting</dt>
                  <dd>{fmt(p.order.invoiceAt)}</dd>
                </dl>
                {p.order.notes && <p className="prewrap">{p.order.notes}</p>}
              </section>
            )}
          </>
        ) : (
          <>
            <h3>Approval path</h3>
            <div className="approval-path">
              {approvalSteps(p).map((step, i) => {
                const a = p.approvals.find((a) => step.includes(a.role));
                return (
                  <div
                    className={"approval-step " + (a ? "complete" : "")}
                    key={i}
                  >
                    <span className="step-circle">
                      {a ? <Check size={15} /> : i + 1}
                    </span>
                    <div>
                      <strong>
                        {step.map((r) => ROLE_NAMES[r]).join(" or ")}
                      </strong>
                      {a ? (
                        <p>
                          {a.actorName} · {fmt(a.at, true)}
                          {a.note && <small>{a.note}</small>}
                        </p>
                      ) : (
                        <p>
                          {p.status === "Rejected"
                            ? "Not completed"
                            : nextStep(p) === step
                              ? "Awaiting approval"
                              : "Awaiting approval"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <h3>Activity & revision history</h3>
            <div className="activity-list">
              {w.audit
                .filter((a) => a.requestId === p.id)
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((a) => (
                  <div key={a.id} className="activity-item">
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.action}</strong>
                      <p>
                        {a.actorName} · Revision {a.revision}
                      </p>
                      <small className="prewrap">{a.note}</small>
                      {a.previousVersion && (
                        <details className="previous-version">
                          <summary>
                            View revision {a.previousVersion.revision}
                          </summary>
                          <strong>
                            {a.previousVersion.title} ·{" "}
                            {money(a.previousVersion.total)}
                          </strong>
                          <p>
                            {a.previousVersion.supplier} ·{" "}
                            {a.previousVersion.department}
                          </p>
                          <p className="prewrap">
                            {a.previousVersion.explanation}
                          </p>
                          {a.previousVersion.items.map((item, i) => (
                            <p key={i}>
                              {item.description} · {item.quantity} ×{" "}
                              {money(item.unitPrice)}
                            </p>
                          ))}
                          <p>Rejection: {a.previousVersion.rejectionReason}</p>
                          {a.previousVersion.approvals.map((decision, i) => (
                            <p key={i}>
                              {ROLE_NAMES[decision.role]}: {decision.actorName}{" "}
                              · {fmt(decision.at, true)}
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                    <time>{fmt(a.at, true)}</time>
                  </div>
                ))}
            </div>
          </>
        )}
        {canApprove(w.me, p) && (
          <div className="review-box">
            <h3>Review this proposal</h3>
            <p>
              Approving as {w.me.name} ·{" "}
              {nextStep(p)
                .map((r) => ROLE_NAMES[r])
                .join(" or ")}
            </p>
            <label>
              Review note <em>required for rejection</em>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note or explain the reason for rejection"
              />
            </label>
            <div className="row">
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => act("reject")}
              >
                Reject proposal
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => act("approve")}
              >
                <Check size={16} />
                {busy ? "Saving…" : "Approve purchase"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer detail-footer">
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} />
          Print
        </button>
        <button className="btn" onClick={onReorder}>
          <RotateCcw size={15} />
          Reorder
        </button>
        {hasRole(w.me, "accounting") &&
          p.status !== "Rejected" &&
          (p.status === "Approved" || p.emergency) && (
            <button className="btn primary" onClick={onOrder}>
              <Truck size={16} />
              {p.order ? "Update order" : "Record purchase order"}
            </button>
          )}
      </div>
    </Modal>
  );
}
export default function PurchasingApp() {
  const [w, setW] = useState<Workspace | null>(null),
    [actor, setActor] = useState(""),
    [view, setView] = useState("overview"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("All statuses"),
    [dept, setDept] = useState("All departments"),
    [priority, setPriority] = useState("All priorities"),
    [fulfillment, setFulfillment] = useState("All order stages"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState<{ source?: Purchase; revision: boolean } | null>(
      null,
    ),
    [orderId, setOrderId] = useState<string | null>(null),
    [exportOpen, setExportOpen] = useState(false),
    [mobile, setMobile] = useState(false),
    [exportType, setExportType] = useState("summary");
  const request = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(path, {
      ...init,
      headers: {
        ...(actor ? { "x-demo-member": actor } : {}),
        ...init.headers,
      },
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };
  const refresh = async () => {
    const data = await request("/api/workspace");
    setW(data);
    return data;
  };
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setSelected(null);
    request("/api/workspace")
      .then((data) => {
        if (live) setW(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [actor]);
  useEffect(() => {
    setPage(1);
  }, [search, status, dept, priority, fulfillment, view]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (v: string) => {
    setView(v);
    setStatus("All statuses");
    setDept("All departments");
    setPriority("All priorities");
    setFulfillment("All order stages");
    setSearch("");
    setPage(1);
    setMobile(false);
  };
  const all = w?.requests ?? [];
  const pending = all.filter((p) => p.status === "Pending"),
    ready = all.filter((p) => p.status === "Approved" && !p.order),
    ordered = all.filter((p) => p.order),
    inbox = all.filter((p) => w && canApprove(w.me, p));
  const filtered = useMemo(
    () =>
      all
        .filter(
          (p) =>
            (view !== "approvals" || (!!w && canApprove(w.me, p))) &&
            (view !== "history" || !!p.order) &&
            (status === "All statuses" || p.status === status) &&
            (dept === "All departments" || p.department === dept) &&
            (priority === "All priorities" || p.priority === priority) &&
            (fulfillment === "All order stages" ||
              (fulfillment === "Not ordered" && !p.order) ||
              (fulfillment === "Ordered" && !!p.order && !p.order.receivedAt) ||
              (fulfillment === "Received" && !!p.order?.receivedAt)) &&
            [
              p.number,
              p.title,
              p.supplier,
              p.requesterName,
              p.quoteNumber,
              p.order?.poNumber,
              p.department,
              p.contactName,
              p.projectManager,
              p.explanation,
              p.items.map((i) => i.partNumber + " " + i.description).join(" "),
              p.quotes.map((q) => q.vendor + " " + q.number).join(" "),
            ]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [all, view, status, dept, priority, fulfillment, search, w],
  );
  const active = all.find((p) => p.id === selected),
    order = all.find((p) => p.id === orderId),
    visible = filtered.slice((page - 1) * 10, page * 10);
  const totalSpend = ordered.reduce((s, p) => s + p.total, 0);
  const deptSpend = Object.entries(
    ordered.reduce(
      (obj, p) => ({
        ...obj,
        [shortDept(p.department)]:
          (obj[shortDept(p.department)] || 0) + p.total,
      }),
      {} as Record<string, number>,
    ),
  ).sort((a, b) => b[1] - a[1]);
  const act = async (p: Purchase, action: string, fields: any) => {
    setBusy(true);
    try {
      const data = await request(`/api/requests/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version: p.version, ...fields }),
      });
      await refresh();
      setToast(
        action === "approve"
          ? "Approval saved with date and time."
          : action === "reject"
            ? "Proposal rejected. Reason saved for the requester."
            : action === "resubmit"
              ? "Revised proposal submitted for fresh approvals."
              : "Order details saved.",
      );
      return data;
    } finally {
      setBusy(false);
    }
  };
  const submit = async (fields: any) => {
    setBusy(true);
    try {
      let saved;
      if (form?.revision && form.source)
        saved = await act(form.source, "resubmit", { fields });
      else
        saved = await request("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
      await refresh();
      setForm(null);
      setSelected(saved.id);
      setToast("Purchase proposal submitted.");
    } finally {
      setBusy(false);
    }
  };
  const download = (
    content: BlobPart,
    name: string,
    type = "text/csv;charset=utf-8",
  ) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const exportData = () => {
    const stamp = businessDate(new Date().toISOString());
    if (exportType === "json")
      download(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            records: filtered,
            audit: w?.audit.filter((a) =>
              filtered.some((p) => p.id === a.requestId),
            ),
          },
          null,
          2,
        ),
        `fuji-purchases-${stamp}.json`,
        "application/json",
      );
    else if (exportType === "audit")
      download(
        toCSV([
          [
            "Request ID",
            "Action",
            "Actor",
            "Date and time (UTC)",
            "Revision",
            "Note",
          ],
          ...(w?.audit ?? [])
            .filter((a) => filtered.some((p) => p.id === a.requestId))
            .map((a) => [
              all.find((p) => p.id === a.requestId)?.number,
              a.action,
              a.actorName,
              a.at,
              a.revision,
              a.note,
            ]),
        ]),
        `fuji-audit-${stamp}.csv`,
      );
    else
      download(
        toCSV(exportRows(filtered, exportType === "items")),
        `fuji-${exportType === "items" ? "purchase-line-items" : "purchase-summary"}-${stamp}.csv`,
      );
    setExportOpen(false);
    setToast(`${filtered.length} requests exported.`);
  };
  const table = (compact = false) => (
    <>
      <div className="table-wrap">
        <table className="request-table">
          <thead>
            <tr>
              <th>Request / item</th>
              <th>Department</th>
              {!compact && <th>Requested by</th>}
              <th className="num">Amount</th>
              <th>Needed by</th>
              <th>Status</th>
              <th className="arrow-col">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="request-link"
                    onClick={() => setSelected(p.id)}
                  >
                    <span>
                      {p.number}
                      {p.sample && <span className="table-sample">SAMPLE</span>}
                      {p.priority === "Rush" && (
                        <b className="rush-dot" title="Rush priority" />
                      )}
                    </span>
                    <strong>{p.title}</strong>
                    <small>{p.supplier}</small>
                  </button>
                </td>
                <td>
                  <span className="dept-label">{shortDept(p.department)}</span>
                </td>
                {!compact && (
                  <td>
                    <div className="person-cell">
                      <span
                        className={
                          "avatar " +
                          (p.requesterId === "demo-employee-2"
                            ? "lavender"
                            : "")
                        }
                      >
                        {initials(p.requesterName)}
                      </span>
                      <span>{p.requesterName}</span>
                    </div>
                  </td>
                )}
                <td className="num amount-cell">{money(p.total)}</td>
                <td>
                  <span className="date-text">
                    {fmt(p.neededBy).replace(", 2026", "")}
                  </span>
                  {p.priority === "Rush" && (
                    <small className="rush-label">Rush</small>
                  )}
                </td>
                <td>
                  <Badge
                    value={
                      view === "history"
                        ? p.order?.receivedAt
                          ? "Received"
                          : "Ordered"
                        : p.status
                    }
                  />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    onClick={() => setSelected(p.id)}
                    aria-label={`Open ${p.number}`}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <div className="empty">
          <Search size={28} />
          <h3>No requests found</h3>
          <p>
            {view === "approvals"
              ? "There are no proposals awaiting your approval. Try a manager demo role or check back later."
              : "Try a different search or filter, or create a purchase request."}
          </p>
          <button
            className="btn"
            onClick={() => {
              setSearch("");
              setStatus("All statuses");
              setDept("All departments");
              setPriority("All priorities");
              setFulfillment("All order stages");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="pagination">
        <span>
          Showing {filtered.length ? (page - 1) * 10 + 1 : 0}–
          {Math.min(page * 10, filtered.length)} of {filtered.length} requests
        </span>
        <div>
          <button
            className="icon-btn"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(filtered.length / 10))}
          </span>
          <button
            className="icon-btn"
            aria-label="Next page"
            disabled={page * 10 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
  const filters = (
    <div className="filters">
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Search purchases"
          placeholder="Search requests, items, suppliers, PO #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="icon-btn"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <select
        aria-label="Filter by status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {["All statuses", "Pending", "Approved", "Rejected"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        aria-label="Filter by department"
        value={dept}
        onChange={(e) => setDept(e.target.value)}
      >
        <option>All departments</option>
        {DEPARTMENTS.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <select
        aria-label="Filter by priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
      >
        <option>All priorities</option>
        <option>Rush</option>
        <option>Normal</option>
      </select>
      <select
        aria-label="Filter by order stage"
        value={fulfillment}
        onChange={(e) => setFulfillment(e.target.value)}
      >
        {["All order stages", "Not ordered", "Ordered", "Received"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="/" aria-label="Fuji Purchasing Hub home">
          <div className="brand-mark">
            <Leaf size={25} />
          </div>
          <div>
            <strong>
              FUJI<span> SILYSIA</span>
            </strong>
            <small>PURCHASING HUB</small>
          </div>
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Building2 size={16} />
          </span>
          <div>
            <strong>Fuji Chemical USA</strong>
            <small>MIS 4173 · Team 2</small>
          </div>
          <ChevronDown size={13} />
        </div>
        <span className="nav-section">WORKSPACE</span>
        <nav>
          {views
            .filter(([id]) => id !== "people" || w?.owner)
            .map(([id, label, Icon], i) => (
              <button
                className={
                  (view === id ? "active " : "") +
                  (i === 5 ? "nav-divider" : "")
                }
                key={id}
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "approvals" && inbox.length > 0 && (
                  <b>{inbox.length}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-help">
          <div className="help-icon">
            <ShieldCheck size={20} />
          </div>
          <strong>Every approval, accounted for.</strong>
          <p>A clear record from purchase proposal to delivery.</p>
          <button onClick={() => navigate("policy")}>
            View purchasing policy <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="owner-avatar">T2</span>
          <div>
            <strong>Team 2 Workspace</strong>
            <small>Systems Analysis & Design</small>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{views.find((v) => v[0] === view)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="secure-indicator">
              <span />
              Signed-in workspace
            </span>
            <div className="topbar-divider" />
            <span className="user-avatar">
              {initials(w?.me.name ?? "Alex Parker")}
            </span>
            <div className="persona-control">
              <span>VIEWING AS {w?.demoMode ? "· DEMO" : ""}</span>
              <select
                aria-label="Switch demo role"
                value={actor}
                onChange={(e) => {
                  setActor(e.target.value);
                  setForm(null);
                  setOrderId(null);
                }}
              >
                {w?.owner ? (
                  <>
                    <option value="">Workspace owner</option>
                    {w.actors.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name} · {ROLE_NAMES[m.roles[0]]}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value={actor}>{w?.me.name ?? "Loading…"}</option>
                )}
              </select>
            </div>
          </div>
        </header>
        <main id="main" className="content">
          <div className="sample-banner">
            <div>
              <span className="sample-dot" />
              <strong>Sample data included</strong>
              <span className="banner-divider" />
              <span>
                64 fictional records to explore the purchasing workflow.
              </span>
            </div>
            {w?.owner ? (
              <button
                className="text-btn"
                onClick={() => setActor(actor ? "" : "demo-employee")}
              >
                {actor ? "Return to owner" : "Try employee view"}{" "}
                <ArrowRight size={13} />
              </button>
            ) : (
              <span className="banner-label">MIS 4173 · TEAM 2</span>
            )}
          </div>
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <h2>Opening your workspace…</h2>
            </div>
          ) : error && !w ? (
            <div className="empty">
              <AlertCircle size={32} />
              <h2>Workspace unavailable</h2>
              <p>{error}</p>
              {error.includes("Sign in") ? (
                <a
                  className="btn primary"
                  href="/signin-with-chatgpt?return_to=/"
                  target="_top"
                >
                  Sign in with ChatGPT
                </a>
              ) : (
                <button
                  className="btn"
                  onClick={() => {
                    setLoading(true);
                    refresh()
                      .catch((e) => setError(e.message))
                      .finally(() => setLoading(false));
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            w && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="overline">
                      {view === "overview"
                        ? "YOUR PURCHASING WORKSPACE"
                        : view === "history"
                          ? "A SEARCHABLE RECORD OF EVERY ORDER"
                          : view === "approvals"
                            ? "KEEP PURCHASES MOVING"
                            : view === "reports"
                              ? "TURN PURCHASES INTO INSIGHT"
                              : "FUJI SILYSIA CHEMICAL USA"}
                    </div>
                    <h1>
                      {view === "overview"
                        ? "Purchasing overview"
                        : views.find((v) => v[0] === view)?.[1]}
                    </h1>
                    <p>
                      {view === "overview"
                        ? "A clearer view of requests, approvals, and every purchase in between."
                        : view === "requests"
                          ? "Create, review, and track purchase proposals from one place."
                          : view === "approvals"
                            ? "Review proposals that need your sign-off. Every decision is dated."
                            : view === "history"
                              ? "Find what you purchased, who supplied it, and when it was ordered."
                              : view === "reports"
                                ? "Export complete records for Excel, Google Sheets, and pivot tables."
                                : view === "policy"
                                  ? "Approval rules based on the supplied purchasing procedures."
                                  : "Assign operational roles to people who can access this private workspace."}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {!["policy", "people"].includes(view) && (
                      <button
                        className="btn"
                        onClick={() => setExportOpen(true)}
                      >
                        <ArrowDownToLine size={16} />
                        Export data
                      </button>
                    )}
                    {!["policy", "people", "reports"].includes(view) && (
                      <button
                        className="btn primary"
                        onClick={() => setForm({ revision: false })}
                      >
                        <Plus size={17} />
                        New request
                      </button>
                    )}
                  </div>
                </div>
                {view === "overview" && (
                  <>
                    <div className="stats-grid">
                      {[
                        {
                          title: "Pending approval",
                          value: String(pending.length),
                          note: `${pending.filter((p) => p.priority === "Rush").length} marked as rush`,
                          Icon: Clock,
                          color: "amber",
                          click: () => {
                            navigate("requests");
                            setStatus("Pending");
                          },
                        },
                        {
                          title: "Ready to order",
                          value: String(ready.length),
                          note: "Approved · awaiting a PO",
                          Icon: ShieldCheck,
                          color: "green",
                          click: () => {
                            navigate("requests");
                            setStatus("Approved");
                            setFulfillment("Not ordered");
                          },
                        },
                        {
                          title: "Purchases ordered",
                          value: String(ordered.length),
                          note: `${ordered.filter((p) => !p.order?.receivedAt).length} awaiting delivery`,
                          Icon: Package,
                          color: "blue",
                          click: () => navigate("history"),
                        },
                        {
                          title: "Total ordered value",
                          value: money(totalSpend),
                          note: "Across your visible purchase history",
                          Icon: BarChart3,
                          color: "green",
                          click: () => navigate("reports"),
                        },
                      ].map(({ title, value, note, Icon, color, click }) => (
                        <button
                          className="stat-card"
                          onClick={click}
                          key={title}
                        >
                          <div className="row spread">
                            <span>{title}</span>
                            <span className={"stat-icon " + color}>
                              <Icon size={17} />
                            </span>
                          </div>
                          <strong
                            className={
                              title === "Total ordered value"
                                ? "small-value"
                                : ""
                            }
                          >
                            {value}
                          </strong>
                          <div className="stat-bottom">
                            <small>{note}</small>
                            <ArrowUpRight size={15} />
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="overview-insight">
                      <div className="insight-icon">
                        <ShieldCheck size={21} />
                      </div>
                      <p>
                        <strong>
                          {pending.length} proposals are moving through
                          approvals.
                        </strong>
                        <span>
                          Review a request to see its next approver and complete
                          decision history.
                        </span>
                      </p>
                      <button
                        className="text-btn"
                        onClick={() => navigate("approvals")}
                      >
                        View approval inbox <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {["overview", "requests", "approvals", "history"].includes(
                  view,
                ) && (
                  <div className={view === "overview" ? "overview-grid" : ""}>
                    <section className="panel requests-panel">
                      <div className="panel-header">
                        <div>
                          <h2>
                            {view === "overview"
                              ? "Recent purchase requests"
                              : view === "approvals"
                                ? "Your approval inbox"
                                : view === "history"
                                  ? "Order history"
                                  : "All purchase requests"}{" "}
                            <span className="count-pill">
                              {filtered.length}
                            </span>
                          </h2>
                          {view === "overview" && (
                            <p>
                              The latest activity across your purchasing
                              workspace.
                            </p>
                          )}
                        </div>
                        {view === "overview" && (
                          <button
                            className="text-btn"
                            onClick={() => navigate("requests")}
                          >
                            View all <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                      {view === "overview" ? (
                        <div className="table-tabs">
                          <button
                            className={
                              status === "All statuses" ? "active" : ""
                            }
                            onClick={() => setStatus("All statuses")}
                          >
                            All requests
                          </button>
                          {["Pending", "Approved", "Rejected"].map((s) => (
                            <button
                              key={s}
                              className={status === s ? "active" : ""}
                              onClick={() => setStatus(s)}
                            >
                              {s}
                              <span>
                                {all.filter((p) => p.status === s).length}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        filters
                      )}
                      {table(view === "overview")}
                    </section>
                    {view === "overview" && (
                      <aside className="right-column">
                        <section className="panel spend-panel">
                          <div className="panel-header">
                            <h2>Spend by department</h2>
                            <BarChart3 size={17} />
                          </div>
                          <div className="spend-total">
                            <strong>{money(totalSpend)}</strong>
                            <small>Total ordered value</small>
                          </div>
                          <div className="spend-bars">
                            {deptSpend.slice(0, 5).map(([name, value], i) => (
                              <div key={name}>
                                <div>
                                  <span>{name}</span>
                                  <strong>{money(value)}</strong>
                                </div>
                                <div className="bar-track">
                                  <span
                                    style={{
                                      width: `${(value / (deptSpend[0]?.[1] || 1)) * 100}%`,
                                      opacity: 1 - i * 0.12,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="text-btn"
                            onClick={() => navigate("reports")}
                          >
                            Explore reports <ArrowRight size={14} />
                          </button>
                        </section>
                        <section className="workflow-card">
                          <div className="row spread">
                            <span className="workflow-symbol">
                              <ClipboardList size={20} />
                            </span>
                            <span className="overline">BUILT FOR FUJI</span>
                          </div>
                          <h2>
                            From proposal
                            <br />
                            to purchase.
                          </h2>
                          <p>
                            The right information.
                            <br />
                            The right approvals. All in one place.
                          </p>
                          <div className="mini-flow">
                            <span>
                              <Check size={12} /> Submit
                            </span>
                            <i />
                            <span>
                              <Check size={12} /> Approve
                            </span>
                            <i />
                            <span>
                              <Truck size={12} /> Order
                            </span>
                          </div>
                          <button onClick={() => navigate("policy")}>
                            How approvals work <ArrowUpRight size={15} />
                          </button>
                        </section>
                        <div className="data-note">
                          <Leaf size={16} />
                          <p>
                            Designed around Fuji’s purchase proposal form and
                            Chase’s feedback.
                          </p>
                        </div>
                      </aside>
                    )}
                  </div>
                )}
                {view === "reports" && (
                  <>
                    <div className="report-hero">
                      <div>
                        <span className="overline">
                          PURCHASE HISTORY, READY TO ANALYZE
                        </span>
                        <h2>
                          Find the part.
                          <br />
                          See the bigger picture.
                        </h2>
                        <p>
                          One row per request for a quick overview, or one row
                          per item for deeper analysis. Both open directly in
                          Excel and Google Sheets.
                        </p>
                        <button
                          className="btn primary"
                          onClick={() => {
                            setExportType("items");
                            setExportOpen(true);
                          }}
                        >
                          <ArrowDownToLine size={16} />
                          Export purchase line items
                        </button>
                      </div>
                      <div className="report-illustration">
                        <div className="sheet-title">
                          <span />
                          <span />
                          <span />
                          <strong>FUJI PURCHASE DATA</strong>
                        </div>
                        <div className="sheet-row head">
                          <span>DEPARTMENT</span>
                          <span>SUPPLIER</span>
                          <span>AMOUNT</span>
                        </div>
                        {ordered.slice(0, 5).map((p) => (
                          <div className="sheet-row" key={p.id}>
                            <span>{shortDept(p.department)}</span>
                            <span>{p.supplier}</span>
                            <strong>{money(p.total)}</strong>
                          </div>
                        ))}
                        <div className="sheet-tag">
                          <CheckCircle2 size={15} />
                          Pivot-table friendly
                        </div>
                      </div>
                    </div>
                    <div className="report-summary">
                      <section className="panel">
                        <div className="panel-header">
                          <h2>Ordered spend by supplier</h2>
                          <span className="hint">Visible records</span>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Supplier</th>
                              <th className="num">Orders</th>
                              <th className="num">Ordered value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(
                              ordered.reduce(
                                (o, p) => ({
                                  ...o,
                                  [p.supplier]: [...(o[p.supplier] || []), p],
                                }),
                                {} as Record<string, Purchase[]>,
                              ),
                            )
                              .sort(
                                (a, b) =>
                                  b[1].reduce((s, p) => s + p.total, 0) -
                                  a[1].reduce((s, p) => s + p.total, 0),
                              )
                              .map(([s, rows]) => (
                                <tr key={s}>
                                  <td>{s}</td>
                                  <td className="num">{rows.length}</td>
                                  <td className="num">
                                    <strong>
                                      {money(
                                        rows.reduce(
                                          (sum, p) => sum + p.total,
                                          0,
                                        ),
                                      )}
                                    </strong>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </section>
                      <section className="panel export-panel">
                        <FileText size={27} />
                        <h2>Four useful export formats</h2>
                        <p>
                          Use the purchase request filters to narrow your
                          export.
                        </p>
                        {[
                          [
                            "summary",
                            "Request summary",
                            "One row per proposal, including approval and order dates.",
                          ],
                          [
                            "items",
                            "Purchase line items",
                            "Part numbers, quantities, and unit prices for pivot tables.",
                          ],
                          [
                            "audit",
                            "Approval activity",
                            "Timestamped decisions, actors, notes, and revisions.",
                          ],
                          [
                            "json",
                            "Complete JSON backup",
                            "Full request records, quotes, attachments metadata, and audit events.",
                          ],
                        ].map(([id, title, desc]) => (
                          <button
                            key={id}
                            onClick={() => {
                              setExportType(id);
                              setExportOpen(true);
                            }}
                          >
                            <div>
                              <strong>{title}</strong>
                              <small>{desc}</small>
                            </div>
                            <ArrowDownToLine size={17} />
                          </button>
                        ))}
                      </section>
                    </div>
                  </>
                )}
                {view === "policy" && (
                  <div className="policy-grid">
                    <section className="panel policy-panel">
                      <div className="policy-title">
                        <ShieldCheck size={25} />
                        <div>
                          <h2>Purchase approval requirements</h2>
                          <p>Purchasing Procedures · March 22, 2012</p>
                        </div>
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th>Purchase amount / type</th>
                            <th>Required approval route</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <strong>Up to $150</strong>
                            </td>
                            <td>
                              Immediate Supervisor
                              <br />
                              <small>
                                Treasurer or Controller if the supervisor is
                                absent
                              </small>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Above $150 through $1,000</strong>
                            </td>
                            <td>
                              Immediate Supervisor → Controller or Vice
                              President
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Above $1,000</strong>
                            </td>
                            <td>
                              Immediate Supervisor → Controller → Vice President
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Raw materials</strong>
                              <small>Any amount</small>
                            </td>
                            <td>Plant Manager or Controller</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="policy-notes">
                        <h3>Ordering & emergencies</h3>
                        <p>
                          Purchasing receives the approved proposal before
                          placing an order. Accounting enters the PO number,
                          order date, account number, and delivery details.
                        </p>
                        <p>
                          Emergency production purchases require verbal approval
                          from the Plant Manager. Emergency BA purchases require
                          verbal approval from the Vice President or Controller.
                          Written proposals and required signatures are due
                          within one day.
                        </p>
                        <h3>Implementation decisions</h3>
                        <p>
                          The source overlaps at exactly $150. This app assigns
                          $150 to the basic tier and starts the next tier above
                          $150. For $150–$1,000, it requires the supervisor plus
                          either Controller or VP. Approvals proceed in the
                          displayed order. These interpretations are documented
                          for Fuji’s review.
                        </p>
                        <p>
                          Pending, Approved, and Rejected describe the proposal.
                          Ordered and Received are separate fulfillment labels.
                          Rejected proposals may be revised and resubmitted;
                          prior decisions remain in the audit history.
                        </p>
                      </div>
                    </section>
                    <aside>
                      <section className="panel policy-aside">
                        <Clock size={24} />
                        <h2>Dates are part of the record.</h2>
                        <p>
                          Submission, every approval, final approval, order,
                          delivery, and invoice dates remain visible and
                          exportable.
                        </p>
                      </section>
                      <section className="panel policy-aside">
                        <FileText size={24} />
                        <h2>A note on sample data</h2>
                        <p>
                          All seeded records are marked fictional. One item and
                          amount are inspired by the supplied shrink-wrap form.
                          Supplier names, people, and workflow events in the
                          dataset are simulated.
                        </p>
                      </section>
                    </aside>
                  </div>
                )}
                {view === "people" && (
                  <People
                    w={w}
                    request={request}
                    refresh={refresh}
                    setToast={setToast}
                  />
                )}
                <footer className="page-footer">
                  <span>
                    <Leaf size={13} /> Fuji Silysia Chemical USA · Purchasing
                    Hub
                  </span>
                  <span>
                    MIS 4173 · Team 2 <span> / </span> Academic demonstration
                  </span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {form && w && (
        <RequestForm
          source={form.source}
          revision={form.revision}
          me={w.me}
          members={w.members}
          busy={busy}
          onClose={() => {
            if (!busy) setForm(null);
          }}
          onSave={submit}
        />
      )}
      {active && w && !form && !order && (
        <RequestDetail
          key={active.id}
          p={active}
          w={w}
          busy={busy}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
          onAction={(a, note) => act(active, a, { note })}
          onRevise={() => setForm({ source: active, revision: true })}
          onReorder={() => setForm({ source: active, revision: false })}
          onOrder={() => setOrderId(active.id)}
          onUpload={async (file) => {
            setBusy(true);
            try {
              const fd = new FormData();
              fd.append("file", file);
              await request(`/api/attachments/${active.id}`, {
                method: "POST",
                body: fd,
              });
              await refresh();
              setToast("Document attached.");
            } finally {
              setBusy(false);
            }
          }}
          onDownload={async (a) => {
            const r = await fetch(`/api/attachments/${a.id}`, {
              headers: actor ? { "x-demo-member": actor } : {},
            });
            if (!r.ok) throw new Error("The file could not be downloaded.");
            download(await r.blob(), a.name, "application/octet-stream");
          }}
        />
      )}
      {order && (
        <OrderForm
          p={order}
          busy={busy}
          onClose={() => {
            if (!busy) setOrderId(null);
          }}
          onSave={async (o) => {
            await act(order, "order", { order: o });
            setOrderId(null);
          }}
        />
      )}
      {exportOpen && (
        <Modal
          title="Export purchase data"
          onClose={() => setExportOpen(false)}
        >
          <div className="modal-body">
            <div className="export-intro">
              <span className="stat-icon green">
                <ArrowDownToLine size={23} />
              </span>
              <div>
                <h3>{filtered.length} requests ready to export</h3>
                <p>
                  Your current search, filters, and access permissions are
                  applied.
                </p>
              </div>
            </div>
            <div className="export-options">
              {[
                [
                  "summary",
                  "Request summary CSV",
                  "One row per request. Ideal for a purchase register.",
                ],
                [
                  "items",
                  "Purchase line items CSV",
                  "One row per item. Ready for Excel pivot tables.",
                ],
                [
                  "audit",
                  "Approval activity CSV",
                  "Decision history with actors and precise timestamps.",
                ],
                [
                  "json",
                  "Complete JSON backup",
                  "Full records and audit history for future reuse.",
                ],
              ].map(([id, t, d]) => (
                <label className={exportType === id ? "selected" : ""} key={id}>
                  <input
                    type="radio"
                    name="exportType"
                    value={id}
                    checked={exportType === id}
                    onChange={() => setExportType(id)}
                  />
                  <span>
                    <strong>{t}</strong>
                    <small>{d}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="alert info">
              <FileText size={17} />
              <p>
                CSV files open in Excel or import into Google Sheets. Dates use
                ISO format; amounts remain numeric. Sample records are labeled
                in every export.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setExportOpen(false)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={exportData}
              disabled={!filtered.length}
            >
              <ArrowDownToLine size={16} />
              Download {exportType === "json" ? "JSON" : "CSV"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function People({
  w,
  request,
  refresh,
  setToast,
}: {
  w: Workspace;
  request: (p: string, i?: RequestInit) => Promise<any>;
  refresh: () => Promise<any>;
  setToast: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("employee"),
    [department, setDepartment] = useState("Packaging (90)"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="people-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>Workspace members</h2>
          <span className="count-pill">{w.members.length}</span>
        </div>
        <div className="member-list">
          {w.members.map((m) => (
            <div key={m.id}>
              <span className="avatar">{initials(m.name)}</span>
              <div>
                <strong>
                  {m.name}
                  {m.demo && <span className="sample-tag">SAMPLE</span>}
                </strong>
                <small>
                  {m.email || "Demo member"}
                  {m.departments.length > 0
                    ? " · " +
                      (m.departments.length > 2
                        ? "All departments"
                        : m.departments.map(shortDept).join(", "))
                    : ""}
                </small>
              </div>
              <Badge value={ROLE_NAMES[m.roles[0]]} />
            </div>
          ))}
        </div>
      </section>
      <section className="panel people-form">
        <h2>Add or update a member</h2>
        <p>
          Members sign in with ChatGPT. Assign roles here after granting access
          through the Site’s sharing controls. This form sends no email.
        </p>
        {!hasRole(w.me, "admin") ? (
          <div className="alert info">
            Switch to Workspace owner to manage real members.
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request("/api/members", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, email, role, department }),
                });
                await refresh();
                setName("");
                setEmail("");
                setToast("Member role saved.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Full name *
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              ChatGPT sign-in email *
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(ROLE_NAMES)
                  .filter(([r]) => r !== "admin")
                  .map(([r, n]) => (
                    <option key={r} value={r}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            {role === "supervisor" && (
              <label>
                Department
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Save member"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
