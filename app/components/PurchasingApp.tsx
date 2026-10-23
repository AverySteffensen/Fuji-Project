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
  PRIORITIES,
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
  emergencyDue,
  businessDate,
} from "@/lib/purchasing/domain";
import {
  DEFAULT_FILTERS,
  DATE_FIELDS,
  isOverdue,
  selectRequests,
  type RegisterFilters,
  type DateField,
  type SortField,
} from "@/lib/purchasing/register";
import {
  createXlsx,
  purchaseSheets,
  XLSX_MIME,
  type ExcelSheet,
} from "@/lib/purchasing/xlsx";
const views = [
  ["requests", "Purchase requests", ClipboardList],
  ["approvals", "Approvals", ShieldCheck],
  ["history", "Purchase history", History],
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
  priority: "Medium",
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
                {PRIORITIES.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
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
        <div
          className={"detail-title " + (isOverdue(p) ? "overdue-detail" : "")}
        >
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
              <Badge value={p.priority} />
              {isOverdue(p) && <Badge value="Overdue" />}
            </div>
          </div>
        </div>
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
  const [w, setW] = useState<Workspace | null>(null);
  const [actor, setActor] = useState("");
  const [view, setView] = useState("requests");
  const [filters, setFilters] = useState<RegisterFilters>({
    ...DEFAULT_FILTERS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{
    source?: Purchase;
    revision: boolean;
  } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [today, setToday] = useState(() =>
    businessDate(new Date().toISOString()),
  );
  const patchFilters = (patch: Partial<RegisterFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(actor ? { "x-demo-member": actor } : {}),
        ...init.headers,
      },
    });
    const data: any = await response.json();
    if (!response.ok)
      throw new Error(data.error || "The request could not be completed.");
    return data;
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
    setW(null);
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
  }, [filters, view, pageSize, actor]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const update = () => setToday(businessDate(new Date().toISOString()));
    const timer = setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const effectiveFilters = useMemo(
    () => ({ ...filters, view }),
    [filters, view],
  );
  const filtered = useMemo(
    () => (w ? selectRequests(w, effectiveFilters, today) : []),
    [w, effectiveFilters, today],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const active = w?.requests.find((p) => p.id === selected);
  const order = w?.requests.find((p) => p.id === orderId);
  const inboxCount = w?.requests.filter((p) => canApprove(w.me, p)).length ?? 0;
  const overdueCount =
    w?.requests.filter((p) => isOverdue(p, today)).length ?? 0;
  const invalidRange = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );
  const tableView = ["requests", "approvals", "history"].includes(view);
  const navigate = (next: string) => {
    setView(next);
    setFilters({ ...DEFAULT_FILTERS, view: next });
    setPage(1);
  };
  const sort = (field: SortField) =>
    patchFilters({
      sortField: field,
      direction:
        filters.sortField === field && filters.direction === "asc"
          ? "desc"
          : "asc",
    });
  const sortHeading = (label: string, field: SortField, numeric = false) => (
    <th
      className={numeric ? "num" : ""}
      aria-sort={
        filters.sortField === field
          ? filters.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button onClick={() => sort(field)}>
        {label}
        <span aria-hidden="true">
          {filters.sortField === field
            ? filters.direction === "asc"
              ? "↑"
              : "↓"
            : "↕"}
        </span>
      </button>
    </th>
  );
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
            ? "Rejection reason saved."
            : action === "resubmit"
              ? "Revised proposal submitted for approval."
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
      const saved =
        form?.revision && form.source
          ? await act(form.source, "resubmit", { fields })
          : await request("/api/requests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fields),
            });
      await refresh();
      setForm(null);
      setSelected(saved.id);
      setToast("Purchase request submitted.");
    } finally {
      setBusy(false);
    }
  };
  const download = (content: BlobPart, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const exportData = () => {
    if (!w) return;
    try {
      const sheets: ExcelSheet[] =
        view === "policy"
          ? [
              {
                name: "Purchasing policy",
                rows: [
                  ["Purchase amount or type", "Approval route"],
                  ...POLICY_ROWS,
                  [
                    "Emergency production",
                    "Verbal Plant Manager approval. Written approvals within 24 hours.",
                  ],
                  [
                    "Emergency BA",
                    "Verbal Vice President or Controller approval. Written approvals within 24 hours.",
                  ],
                  [
                    "Resubmission",
                    "Rejected requests may be revised. A fresh approval route is required.",
                  ],
                ],
              },
            ]
          : view === "people"
            ? [
                {
                  name: "People and access",
                  rows: [
                    ["Name", "Email", "Roles", "Departments"],
                    ...w.members.map((m) => [
                      m.name,
                      m.email,
                      m.roles.map((r) => ROLE_NAMES[r]).join(", "),
                      m.departments.join(", "),
                    ]),
                  ],
                  widths: [30, 40, 30, 60],
                },
              ]
            : purchaseSheets(filtered, w, effectiveFilters);
      download(createXlsx(sheets), `fuji-${view}-${today}.xlsx`, XLSX_MIME);
      setToast(
        tableView
          ? `${filtered.length} requests exported to Excel.`
          : "Excel file exported.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setPeriod = (period: string) => {
    if (!period || period === "all") return patchFilters({ from: "", to: "" });
    const anchor = new Date(`${today}T12:00:00Z`);
    const start =
      period === "month"
        ? `${today.slice(0, 7)}-01`
        : period === "year"
          ? `${today.slice(0, 4)}-01-01`
          : new Date(anchor.getTime() - (Number(period) - 1) * 86400000)
              .toISOString()
              .slice(0, 10);
    patchFilters({ from: start, to: today });
  };
  return (
    <div className="app-shell register-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="register-header">
        <div className="register-titlebar">
          <a
            className="register-brand"
            href="/"
            aria-label="Fuji Purchasing Register home"
          >
            <span className="register-logo">
              <Leaf size={23} />
            </span>
            <span>
              <strong>FUJI</strong>
              <small>Purchasing register</small>
            </span>
          </a>
          <div className="register-account">
            <span className="user-avatar">
              {initials(w?.me.name ?? "Fuji")}
            </span>
            <label className="persona-control">
              <span>Workspace role</span>
              <select
                aria-label="Workspace role"
                value={actor}
                disabled={!w?.owner}
                onChange={(e) => {
                  setActor(e.target.value);
                  setForm(null);
                  setOrderId(null);
                }}
              >
                <option value="">
                  {w?.owner ? "Workspace owner" : (w?.me.name ?? "Loading…")}
                </option>
                {w?.owner &&
                  w.actors.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name} · {ROLE_NAMES[m.roles[0]]}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>
        <nav className="register-tabs" aria-label="Workspace sections">
          {views
            .filter(([id]) => id !== "people" || w?.owner)
            .map(([id, label, Icon]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                aria-current={view === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={17} />
                {label}
                {id === "approvals" && inboxCount > 0 && (
                  <span>{inboxCount}</span>
                )}
              </button>
            ))}
        </nav>
      </header>
      <main id="main" className="register-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <h2>Opening your workspace…</h2>
          </div>
        ) : !w ? (
          <div className="empty">
            <AlertCircle size={30} />
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
          <>
            <div className="register-heading">
              <div>
                <h1>{views.find((v) => v[0] === view)?.[1]}</h1>
                <p>
                  {view === "requests"
                    ? "Purchase proposals and order progress"
                    : view === "approvals"
                      ? "Requests awaiting your approval"
                      : view === "history"
                        ? "Find parts, suppliers, and previous orders"
                        : view === "policy"
                          ? "Purchase approval requirements"
                          : "Workspace roles and departments"}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="btn export-btn"
                  onClick={exportData}
                  disabled={invalidRange && tableView}
                >
                  <ArrowDownToLine size={17} />
                  Export data <span className="file-type">.xlsx</span>
                </button>
                {tableView && (
                  <button
                    className="btn primary"
                    onClick={() => setForm({ revision: false })}
                  >
                    <Plus size={18} />
                    New request
                  </button>
                )}
              </div>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
                <button
                  className="icon-btn"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {tableView && (
              <>
                <div className="register-summary" aria-label="Workspace totals">
                  <span>
                    <strong>{w.requests.length}</strong> requests
                  </span>
                  <span>
                    <strong>
                      {w.requests.filter((p) => p.status === "Pending").length}
                    </strong>{" "}
                    pending
                  </span>
                  <button
                    className={filters.overdueOnly ? "active" : ""}
                    onClick={() =>
                      patchFilters({ overdueOnly: !filters.overdueOnly })
                    }
                  >
                    <span className="overdue-key" />
                    <strong>{overdueCount}</strong> overdue
                  </button>
                  <span className="summary-value">
                    Filtered value{" "}
                    <strong>
                      {money(filtered.reduce((sum, p) => sum + p.total, 0))}
                    </strong>
                  </span>
                </div>
                <section
                  className="register-sheet"
                  aria-label="Purchase register"
                >
                  <div className="register-filters">
                    <div className="register-search">
                      <Search size={18} />
                      <input
                        aria-label="Search purchases"
                        placeholder="Search item, supplier, part, or PO number"
                        value={filters.search}
                        onChange={(e) =>
                          patchFilters({ search: e.target.value })
                        }
                      />
                      {filters.search && (
                        <button
                          className="icon-btn"
                          aria-label="Clear search"
                          onClick={() => patchFilters({ search: "" })}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <label>
                      <span>Status</span>
                      <select
                        value={filters.status}
                        onChange={(e) =>
                          patchFilters({ status: e.target.value })
                        }
                      >
                        <option value="">All statuses</option>
                        {["Pending", "Approved", "Rejected"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Department</span>
                      <select
                        value={filters.department}
                        onChange={(e) =>
                          patchFilters({ department: e.target.value })
                        }
                      >
                        <option value="">All departments</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Priority</span>
                      <select
                        value={filters.priority}
                        onChange={(e) =>
                          patchFilters({ priority: e.target.value })
                        }
                      >
                        <option value="">All priorities</option>
                        {PRIORITIES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Order stage</span>
                      <select
                        value={filters.fulfillment}
                        onChange={(e) =>
                          patchFilters({ fulfillment: e.target.value })
                        }
                      >
                        <option value="">All stages</option>
                        {["Not ordered", "Ordered", "Received"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="register-date-filters">
                    <label>
                      <span>Date field</span>
                      <select
                        value={filters.dateField}
                        onChange={(e) =>
                          patchFilters({
                            dateField: e.target.value as DateField,
                          })
                        }
                      >
                        {Object.entries(DATE_FIELDS).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>From</span>
                      <input
                        type="date"
                        value={filters.from}
                        aria-invalid={invalidRange}
                        onChange={(e) => patchFilters({ from: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Through</span>
                      <input
                        type="date"
                        value={filters.to}
                        aria-invalid={invalidRange}
                        onChange={(e) => patchFilters({ to: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Date range</span>
                      <select
                        aria-label="Choose date range"
                        value=""
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose range…
                        </option>
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="month">This month</option>
                        <option value="year">This year</option>
                        <option value="all">All dates</option>
                      </select>
                    </label>
                    <label>
                      <span>Sort by</span>
                      <select
                        value={filters.sortField}
                        onChange={(e) =>
                          patchFilters({
                            sortField: e.target.value as SortField,
                          })
                        }
                      >
                        {Object.entries(DATE_FIELDS).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                        <option value="number">Request number</option>
                        <option value="total">Amount</option>
                        <option value="priority">Priority</option>
                        <option value="supplier">Supplier</option>
                      </select>
                    </label>
                    <button
                      className="btn direction-btn"
                      aria-label={
                        filters.direction === "asc"
                          ? "Sort descending"
                          : "Sort ascending"
                      }
                      onClick={() =>
                        patchFilters({
                          direction:
                            filters.direction === "asc" ? "desc" : "asc",
                        })
                      }
                    >
                      {filters.direction === "asc"
                        ? "↑ Ascending"
                        : "↓ Descending"}
                    </button>
                    <button
                      className="text-btn clear-register"
                      onClick={() => setFilters({ ...DEFAULT_FILTERS, view })}
                    >
                      Clear filters
                    </button>
                  </div>
                  {invalidRange && (
                    <p className="range-error" role="alert">
                      The From date must be on or before the Through date.
                    </p>
                  )}
                  <div
                    className="register-grid-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Purchase requests. Scroll horizontally for more columns."
                  >
                    <table className="register-table">
                      <caption className="sr-only">
                        {views.find((v) => v[0] === view)?.[1]}. Select a column
                        heading to sort. Overdue requests are marked in red.
                      </caption>
                      <thead>
                        <tr>
                          <th className="row-index" scope="col">
                            #
                          </th>
                          {sortHeading("Request", "number")}
                          {sortHeading("Item / supplier", "title")}
                          {sortHeading("Department", "department")}
                          {sortHeading("Requested by", "requesterName")}
                          {sortHeading("Amount", "total", true)}
                          {sortHeading("Priority", "priority")}
                          {sortHeading("Submitted", "submittedAt")}
                          {sortHeading("Needed by", "neededBy")}
                          {sortHeading("Status", "status")}
                          <th scope="col">Order / PO</th>
                          <th className="open-col">
                            <span className="sr-only">Open request</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((p, i) => (
                          <tr
                            key={p.id}
                            className={isOverdue(p, today) ? "overdue-row" : ""}
                          >
                            <td className="row-index">
                              {(currentPage - 1) * pageSize + i + 1}
                            </td>
                            <td className="request-id-cell">
                              <button onClick={() => setSelected(p.id)}>
                                {p.number}
                              </button>
                              {isOverdue(p, today) && (
                                <span className="overdue-label">Overdue</span>
                              )}
                            </td>
                            <td className="request-item-cell">
                              <button onClick={() => setSelected(p.id)}>
                                {p.title}
                              </button>
                              <small>{p.supplier}</small>
                            </td>
                            <td>{shortDept(p.department)}</td>
                            <td>{p.requesterName}</td>
                            <td className="num amount-cell">
                              {money(p.total)}
                            </td>
                            <td>
                              <Badge value={p.priority} />
                            </td>
                            <td className="date-cell">{fmt(p.submittedAt)}</td>
                            <td className="date-cell">{fmt(p.neededBy)}</td>
                            <td>
                              <Badge value={p.status} />
                            </td>
                            <td className="order-cell">
                              <span>{p.order?.poNumber || "—"}</span>
                              <small>
                                {p.order
                                  ? p.order.receivedAt
                                    ? `Received ${fmt(p.order.receivedAt)}`
                                    : `Ordered ${fmt(p.order.orderedAt)}`
                                  : "Not ordered"}
                              </small>
                            </td>
                            <td>
                              <button
                                className="icon-btn"
                                aria-label={`Open ${p.number}`}
                                onClick={() => setSelected(p.id)}
                              >
                                <ChevronRight size={19} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <div className="empty">
                        <Search size={27} />
                        <h3>
                          {view === "approvals"
                            ? "No requests awaiting your approval"
                            : "No requests match these filters"}
                        </h3>
                        <p>
                          {invalidRange
                            ? "Correct the date range to view requests."
                            : "Change the filters or clear them to see more requests."}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="register-pagination">
                    <span>
                      {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–
                      {Math.min(currentPage * pageSize, filtered.length)} of{" "}
                      {filtered.length} requests
                    </span>
                    <label>
                      Rows{" "}
                      <select
                        aria-label="Rows per page"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                      >
                        {[25, 50, 100].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <div className="row">
                      <button
                        className="icon-btn"
                        aria-label="Previous page"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>
                        {currentPage} / {pages}
                      </span>
                      <button
                        className="icon-btn"
                        aria-label="Next page"
                        disabled={currentPage >= pages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
            {view === "policy" && (
              <section className="panel register-policy">
                <table>
                  <thead>
                    <tr>
                      <th>Purchase amount / type</th>
                      <th>Required approval route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POLICY_ROWS.map(([amount, route]) => (
                      <tr key={amount}>
                        <td>
                          <strong>{amount}</strong>
                        </td>
                        <td>{route}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="policy-notes">
                  <h3>Orders and emergencies</h3>
                  <p>
                    Purchasing receives the approved proposal before placing an
                    order. Accounting records the purchase order number, order
                    date, account number, and delivery details.
                  </p>
                  <p>
                    Emergency production purchases require verbal Plant Manager
                    approval. Emergency BA purchases require verbal Vice
                    President or Controller approval. Written proposals and
                    required signatures are due within 24 hours.
                  </p>
                  <h3>Dates and revisions</h3>
                  <p>
                    Each decision retains its date and time. Rejected requests
                    can be revised and submitted for fresh approvals. Order and
                    receipt dates are tracked separately.
                  </p>
                </div>
              </section>
            )}
            {view === "people" && (
              <People
                w={w}
                request={request}
                refresh={refresh}
                setToast={setToast}
              />
            )}
            <footer className="register-footer">
              <span>Fuji Silysia Chemical USA</span>
              <span>Purchasing register</span>
            </footer>
          </>
        )}
      </main>
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
          onAction={(action, note) => act(active, action, { note })}
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
          onDownload={async (attachment) => {
            const response = await fetch(`/api/attachments/${attachment.id}`, {
              headers: actor ? { "x-demo-member": actor } : {},
            });
            if (!response.ok)
              throw new Error("The file could not be downloaded.");
            download(
              await response.blob(),
              attachment.name,
              "application/octet-stream",
            );
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
          onSave={async (value) => {
            await act(order, "order", { order: value });
            setOrderId(null);
          }}
        />
      )}
    </div>
  );
}

const POLICY_ROWS = [
  [
    "Up to $150",
    "Immediate Supervisor. Treasurer or Controller if the supervisor is absent.",
  ],
  [
    "Above $150 through $1,000",
    "Immediate Supervisor → Controller or Vice President",
  ],
  ["Above $1,000", "Immediate Supervisor → Controller → Vice President"],
  ["Raw materials, any amount", "Plant Manager or Controller"],
];

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
                <strong>{m.name}</strong>
                <small>
                  {m.email || ""}
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
