import type { Member, Role } from "./types.ts";
import { hasPermission } from "./permissions.ts";

export const ACCESS_LEVEL: Record<Role, number> = {
  employee: 1,
  accounting: 1,
  supervisor: 2,
  controller: 3,
  plantmanager: 3,
  treasurer: 3,
  vicepresident: 4,
  admin: 5,
};
export const memberLevel = (m: Member) =>
  Math.max(0, ...m.roles.map((r) => ACCESS_LEVEL[r]));

export function canAssignRole(manager: Member, role: Role) {
  if (!hasPermission(manager, "manageMembers")) return false;
  const level = memberLevel(manager);
  if (level <= ACCESS_LEVEL.supervisor) {
    return level === ACCESS_LEVEL.supervisor && role === "employee";
  }
  return ACCESS_LEVEL[role] < level;
}

export function canViewAs(manager: Member, person: Member) {
  return (
    hasPermission(manager, "viewAs") &&
    person.active !== false &&
    manager.id !== person.id &&
    memberLevel(manager) > memberLevel(person)
  );
}
export function canEditMember(manager: Member, person: Member) {
  return (
    !person.demo &&
    manager.id !== person.id &&
    person.roles.length > 0 &&
    person.roles.every((role) => canAssignRole(manager, role))
  );
}
