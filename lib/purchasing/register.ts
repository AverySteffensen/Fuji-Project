import type { Purchase, Workspace } from "./types.ts";
import { businessDate, canApprove } from "./domain.ts";

export const DATE_FIELDS = {
  submittedAt: "Submitted",
  neededBy: "Needed by",
  approvedAt: "Approved",
  orderedAt: "Ordered",
  expectedAt: "Expected delivery",
  receivedAt: "Received",
} as const;
export type DateField = keyof typeof DATE_FIELDS;
export type SortField =
  | DateField
  | "number"
  | "title"
  | "supplier"
  | "department"
  | "requesterName"
  | "total"
  | "priority"
  | "status";
export type RegisterFilters = {
  view: string;
  search: string;
  status: string;
  department: string;
  priority: string;
  fulfillment: string;
  dateField: DateField;
  from: string;
  to: string;
  overdueOnly: boolean;
  sortField: SortField;
  direction: "asc" | "desc";
  period?: DatePeriod;
};
export type DatePeriod = "all" | "7" | "30" | "month" | "year" | "custom";
export const SORT_FIELDS: Record<SortField, string> = {
  ...DATE_FIELDS,
  number: "Request number",
  title: "Item / supplier",
  supplier: "Supplier",
  department: "Department",
  requesterName: "Requested by",
  total: "Amount",
  priority: "Priority",
  status: "Status",
};
export function periodDates(period: DatePeriod, today: string) {
  if (period === "all") return { from: "", to: "" };
  if (period === "custom") return {};
  const start =
    period === "month"
      ? `${today.slice(0, 7)}-01`
      : period === "year"
        ? `${today.slice(0, 4)}-01-01`
        : new Date(
            Date.parse(`${today}T12:00:00Z`) - (Number(period) - 1) * 86400000,
          )
            .toISOString()
            .slice(0, 10);
  return { from: start, to: today };
}
export function periodSelection(
  f: Pick<RegisterFilters, "period" | "from" | "to">,
  today: string,
): DatePeriod {
  if (!f.from && !f.to) return "all";
  const period = f.period ?? "custom";
  const expected = periodDates(period, today);
  return period !== "custom" && expected.from === f.from && expected.to === f.to
    ? period
    : "custom";
}
export const DEFAULT_FILTERS: RegisterFilters = {
  view: "requests",
  search: "",
  status: "",
  department: "",
  priority: "",
  fulfillment: "",
  dateField: "submittedAt",
  from: "",
  to: "",
  overdueOnly: false,
  sortField: "submittedAt",
  direction: "desc",
  period: "all",
};
export function requestDate(p: Purchase, field: DateField): string {
  const value =
    field === "orderedAt" || field === "expectedAt" || field === "receivedAt"
      ? (p.order?.[field] ?? "")
      : p[field];
  return value.length > 10 ? businessDate(value) : value;
}
export function isOverdue(
  p: Purchase,
  today = businessDate(new Date().toISOString()),
): boolean {
  return (
    p.status !== "Rejected" &&
    p.status !== "Withdrawn" &&
    !p.order?.receivedAt &&
    Boolean(p.neededBy && p.neededBy < today)
  );
}
export function selectRequests(
  w: Workspace,
  f: RegisterFilters,
  today?: string,
): Purchase[] {
  if (f.from && f.to && f.from > f.to) return [];
  const query = f.search.trim().toLowerCase();
  const rank = { Low: 0, Medium: 1, High: 2 };
  return w.requests
    .filter((p) => {
      if (f.view === "approvals" && !canApprove(w.me, p)) return false;
      if (f.view === "history" && !p.order) return false;
      if (f.view !== "approvals" && f.status && p.status !== f.status)
        return false;
      if (f.department && p.department !== f.department) return false;
      if (f.priority && p.priority !== f.priority) return false;
      if (
        f.view !== "approvals" &&
        f.view !== "history" &&
        f.fulfillment === "Not ordered" &&
        p.order
      )
        return false;
      if (
        f.view !== "approvals" &&
        f.fulfillment === "Ordered" &&
        (!p.order || p.order.receivedAt)
      )
        return false;
      if (
        f.view !== "approvals" &&
        f.fulfillment === "Received" &&
        !p.order?.receivedAt
      )
        return false;
      if (f.overdueOnly && !isOverdue(p, today)) return false;
      const date = requestDate(p, f.dateField);
      if (
        (f.from || f.to) &&
        (!date || (f.from && date < f.from) || (f.to && date > f.to))
      )
        return false;
      return [
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
        ...p.items.flatMap((i) => [i.partNumber, i.description]),
        ...p.quotes.flatMap((q) => [q.vendor, q.number]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const get = (p: Purchase): string | number =>
        f.sortField in DATE_FIELDS
          ? requestDate(p, f.sortField as DateField)
          : f.sortField === "priority"
            ? rank[p.priority]
            : p[f.sortField as Exclude<SortField, DateField>];
      const av = get(a),
        bv = get(b);
      // Missing dates stay last for either sort direction.
      if (av === "" && bv !== "") return 1;
      if (bv === "" && av !== "") return -1;
      const value =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "en", { numeric: true });
      return (
        (f.direction === "asc" ? value : -value) ||
        a.number.localeCompare(b.number)
      );
    });
}
