import {
  body,
  context,
  database,
  json,
  handleError,
} from "@/lib/purchasing/server";
import { BusinessError } from "@/lib/purchasing/domain";
import { canAssignRole, canEditMember } from "@/lib/purchasing/access";
import {
  PERMISSIONS,
  roleAllowsPermission,
} from "@/lib/purchasing/permissions";
import { DEPARTMENTS, ROLES, type Member } from "@/lib/purchasing/types";

export async function POST(req: Request) {
  try {
    const { me, owner } = await context(req);
    if (!canAssignRole(me, "employee"))
      throw new BusinessError("You cannot manage members.", 403);
    const b = await body(req);
    const email = String(b.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BusinessError("Enter the member’s ChatGPT sign-in email.");

    const db = database();
    const prior = await db
      .prepare("SELECT data FROM members WHERE email=?")
      .bind(email)
      .first<{ data: string }>();
    const existing: Member | undefined = prior
      ? JSON.parse(prior.data)
      : undefined;
    // Legacy role forms sent createOnly or expectedRoles in place of an action.
    const action =
      b.action ??
      (b.createOnly || (!existing && !b.expectedRoles) ? "add" : "edit");
    if (!["add", "edit", "remove"].includes(action))
      throw new BusinessError("Choose a valid membership action.");
    if (existing && (existing.demo || existing.roles.includes("admin")))
      throw new BusinessError("This membership is protected.");
    if (existing && !canEditMember(me, existing))
      throw new BusinessError("You cannot manage this membership.", 403);

    const changed = () =>
      new BusinessError(
        "Membership changed. Refresh People & access and try again.",
        409,
      );
    if (b.memberId !== undefined && b.memberId !== existing?.id)
      throw changed();
    if (action !== "add" && !existing) throw changed();
    if (action === "add" && existing && existing.active !== false)
      throw new BusinessError(
        "This person is already a member. Choose Edit roles.",
        409,
      );
    if (action !== "add" && existing?.active === false)
      throw new BusinessError(
        "This membership is removed. Choose Re-add to restore access.",
        409,
      );
    if (action === "add" && existing && !b.memberId)
      throw new BusinessError(
        "This membership was removed. Choose Re-add beside their name.",
        409,
      );

    if (
      existing &&
      (b.action !== undefined || b.disabledPermissions !== undefined) &&
      (b.memberId !== existing.id ||
        b.expectedVersion !== (existing.accessVersion ?? 0))
    )
      throw changed();
    if (
      b.expectedRoles !== undefined &&
      JSON.stringify(b.expectedRoles) !== JSON.stringify(existing?.roles)
    )
      throw changed();

    let roles = existing?.roles ?? [];
    let name = existing?.name ?? "";
    if (action !== "remove") {
      const selected =
        b.roles !== undefined
          ? b.roles
          : b.role !== undefined
            ? [b.role]
            : action === "edit"
              ? existing?.roles
              : undefined;
      if (
        !Array.isArray(selected) ||
        !selected.length ||
        selected.some((r) => !ROLES.includes(r) || r === "admin")
      )
        throw new BusinessError("Choose one or more operational roles.");
      roles = ROLES.filter((r) => selected.includes(r));
      if (roles.some((role) => !canAssignRole(me, role)))
        throw new BusinessError(
          "You cannot assign one or more selected roles.",
          403,
        );
      if (!existing || owner)
        name = String(b.name ?? name)
          .trim()
          .slice(0, 150);
      if (!name) throw new BusinessError("Enter the person’s full name.");
    }

    const member: Member = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name,
      email,
      roles,
      departments: roles.includes("supervisor") ? [...DEPARTMENTS] : [],
      demo: false,
      active: action !== "remove",
      accessVersion: (existing?.accessVersion ?? 0) + 1,
      disabledPermissions:
        action === "add" ? [] : (existing?.disabledPermissions ?? []),
    };
    if (b.disabledPermissions !== undefined && action !== "remove") {
      const selected = b.disabledPermissions;
      if (
        !Array.isArray(selected) ||
        selected.some(
          (p) => !PERMISSIONS.includes(p) || !roleAllowsPermission(member, p),
        )
      )
        throw new BusinessError(
          "Choose permissions available to the selected roles.",
        );
      member.disabledPermissions = PERMISSIONS.filter((p) =>
        selected.includes(p),
      );
    }
    // Both the target and the manager must still have the reviewed access at commit.
    const editorCheck =
      "EXISTS(SELECT 1 FROM members WHERE id=? AND json_extract(data,'$.roles')=? AND COALESCE(json_extract(data,'$.active'),1)=1 AND COALESCE(json_extract(data,'$.accessVersion'),0)=?)";
    const editorArgs = [me.id, JSON.stringify(me.roles), me.accessVersion ?? 0];
    const write = prior
      ? db
          .prepare(
            `UPDATE members SET data=? WHERE email=? AND data=? AND ${editorCheck}`,
          )
          .bind(JSON.stringify(member), email, prior.data, ...editorArgs)
      : db
          .prepare(
            `INSERT INTO members(id,email,data) SELECT ?,?,? WHERE ${editorCheck} ON CONFLICT(email) DO NOTHING`,
          )
          .bind(member.id, email, JSON.stringify(member), ...editorArgs);
    const event = JSON.stringify({
      action: action === "add" && existing ? "re-add" : action,
      memberId: member.id,
      previousRoles: existing?.roles ?? [],
      roles: member.roles,
      previousDisabledPermissions: existing?.disabledPermissions ?? [],
      disabledPermissions: member.disabledPermissions,
      wasActive: !!existing && existing.active !== false,
      active: member.active,
      accessVersion: member.accessVersion,
    });
    const [result] = await db.batch([
      write,
      db
        .prepare(
          "INSERT INTO security_events(id,user_id,action,at) SELECT ?,?,?,? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          me.id,
          "Membership saved " + event,
          new Date().toISOString(),
        ),
    ]);
    if (!result.meta.changes) throw changed();
    return json(member, 201);
  } catch (e) {
    return handleError(e);
  }
}
