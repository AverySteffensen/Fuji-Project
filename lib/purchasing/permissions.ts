import type { Member, Role } from "./types.ts";

export const PERMISSIONS = [
  "submit",
  "revise",
  "withdraw",
  "attach",
  "export",
  "approve",
  "order",
  "viewAs",
  "manageMembers",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  submit: "Submit and reorder requests",
  revise: "Revise own rejected requests",
  withdraw: "Withdraw own pending requests",
  attach: "Attach supporting documents",
  export: "Export to Excel",
  approve: "Approve or reject at assigned steps",
  order: "Record orders, receipts and invoices",
  viewAs: "View As a lower-level member",
  manageMembers: "Manage eligible members and their permissions",
};

const approvalRoles: readonly Role[] = [
  "supervisor",
  "controller",
  "plantmanager",
  "treasurer",
  "vicepresident",
];
type RoleProfile = Pick<Member, "roles" | "demo">;
export function roleAllowsPermission(
  member: RoleProfile,
  permission: Permission,
): boolean {
  const reviewer = member.roles.some((role) => approvalRoles.includes(role));
  switch (permission) {
    case "approve":
      return reviewer;
    case "order":
      return member.roles.includes("accounting");
    case "viewAs":
    case "manageMembers":
      return !member.demo && (reviewer || member.roles.includes("admin"));
    default:
      return member.roles.length > 0;
  }
}

export function hasPermission(member: Member, permission: Permission): boolean {
  return (
    member.active !== false &&
    roleAllowsPermission(member, permission) &&
    !member.disabledPermissions?.includes(permission)
  );
}
