import type { Member, Role } from "./types.ts";

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
export function canViewAs(manager: Member, person: Member) {
  return (
    !manager.demo &&
    manager.active !== false &&
    person.active !== false &&
    manager.id !== person.id &&
    memberLevel(manager) > memberLevel(person)
  );
}
export function canEditMember(manager: Member, person: Member) {
  return (
    !person.demo &&
    !person.roles.includes("admin") &&
    manager.id !== person.id &&
    (canViewAs(manager, person) ||
      (!manager.demo && manager.roles.includes("admin")))
  );
}
