export const DEPARTMENTS = [
  "Water (10)",
  "Waste Water (20)",
  "Boiler (30)",
  "Shipping",
  "Lab",
  "Rx/Dilution (40)",
  "Wash/Ag (50)",
  "Drying (60)",
  "Milling (70)",
  "STD",
  "Packaging (90)",
  "GS (80)",
  "Safety",
  "Other/Maint",
  "HR",
] as const;
export const ROLES = [
  "employee",
  "supervisor",
  "controller",
  "vicepresident",
  "plantmanager",
  "treasurer",
  "accounting",
  "admin",
] as const;
export type Role = (typeof ROLES)[number];
export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const ROLE_NAMES: Record<Role, string> = {
  employee: "Employee",
  supervisor: "Supervisor",
  controller: "Controller",
  vicepresident: "Vice President",
  plantmanager: "Plant Manager",
  treasurer: "Treasurer",
  accounting: "Accounting",
  admin: "Workspace owner",
};
export type Member = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  departments: string[];
  demo: boolean;
  userId?: string;
};
export type LineItem = {
  description: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
};
export type Quote = { vendor: string; number: string; amount: number };
export type Approval = {
  role: Role;
  actorId: string;
  actorName: string;
  at: string;
  note: string;
  revision: number;
};
export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};
export type Order = {
  poNumber: string;
  accountNumber: string;
  purchaserInitials: string;
  orderedAt: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  expectedAt: string;
  receivedAt: string;
  invoiceAt: string;
  notes: string;
};
export type Purchase = {
  id: string;
  number: string;
  title: string;
  requesterId: string;
  requesterName: string;
  department: string;
  purchaseType: "Facilities" | "Lease" | "Other" | "Raw materials";
  priority: Priority;
  neededBy: string;
  explanation: string;
  supplier: string;
  supplierReason: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  quoteNumber: string;
  projectManager: string;
  items: LineItem[];
  quotes: Quote[];
  freight: number;
  tax: number;
  total: number;
  status: "Pending" | "Approved" | "Rejected";
  approvals: Approval[];
  rejectionReason: string;
  submittedAt: string;
  updatedAt: string;
  approvedAt: string;
  revision: number;
  version: number;
  supervisorUnavailable: boolean;
  emergency: boolean;
  emergencyCategory: "Production" | "BA";
  verbalApproverId: string;
  verbalApproverName?: string;
  verbalApprovedAt: string;
  emergencyReason: string;
  attachments: Attachment[];
  order: Order | null;
  sample: boolean;
  referenceInspired?: boolean;
  lastMutationId?: string;
};
export type Audit = {
  id: string;
  requestId: string;
  action: string;
  actorName: string;
  actorId: string;
  at: string;
  note: string;
  revision: number;
  previousVersion?: Purchase;
};
export type Workspace = {
  me: Member;
  owner: boolean;
  actors: Member[];
  members: Member[];
  requests: Purchase[];
  audit: Audit[];
  demoMode: boolean;
};
