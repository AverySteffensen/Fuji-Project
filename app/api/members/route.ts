import {
  body,
  context,
  database,
  json,
  handleError,
} from "@/lib/purchasing/server";
import { BusinessError } from "@/lib/purchasing/domain";
import {
  ACCESS_LEVEL,
  canEditMember,
  memberLevel,
} from "@/lib/purchasing/access";
import { DEPARTMENTS, ROLES, type Member } from "@/lib/purchasing/types";

export async function POST(req: Request) {
  try {
    const { me, owner } = await context(req);
    if (me.demo || memberLevel(me) < 2)
      throw new BusinessError("You cannot manage members.", 403);
    const b = await body(req);
    const email = String(b.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(b.name ?? "")
      .trim()
      .slice(0, 150);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BusinessError("Enter a name and valid email.");
    const selected = b.roles === undefined ? [b.role] : b.roles;
    if (
      !Array.isArray(selected) ||
      !selected.length ||
      selected.some((r) => !ROLES.includes(r) || r === "admin")
    )
      throw new BusinessError("Choose one or more operational roles.");
    const roles = ROLES.filter((r) => selected.includes(r));
    if (roles.some((r) => ACCESS_LEVEL[r] >= memberLevel(me)))
      throw new BusinessError("Choose roles below your own level.", 403);
    const db = database();
    const prior = await db
      .prepare("SELECT data FROM members WHERE email=?")
      .bind(email)
      .first<{ data: string }>();
    const existing: Member | undefined =
      (prior && JSON.parse(prior.data)) || undefined;
    if (b.createOnly && existing)
      throw new BusinessError(
        "This member already exists. Choose Edit roles beside their name.",
        409,
      );
    if (existing && (existing.demo || existing.roles.includes("admin")))
      throw new BusinessError("This membership is protected.");
    if (existing ? !canEditMember(me, existing) : !owner)
      throw new BusinessError(
        "You can change only existing members below your level.",
        403,
      );
    if (
      b.expectedRoles !== undefined &&
      JSON.stringify(b.expectedRoles) !== JSON.stringify(existing?.roles)
    )
      throw new BusinessError(
        "Roles changed. Reopen this member before saving.",
        409,
      );
    const m: Member = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name: owner ? name : existing!.name,
      email,
      roles,
      departments: roles.includes("supervisor") ? [...DEPARTMENTS] : [],
      demo: false,
      ...(owner && existing?.active === false ? { active: true } : {}),
    };
    // Recheck the editor's authority and the target's original state at write time.
    const editorCheck =
      "EXISTS(SELECT 1 FROM members WHERE id=? AND json_extract(data,'$.roles')=? AND COALESCE(json_extract(data,'$.active'),1)=1)";
    const editorArgs = [me.id, JSON.stringify(me.roles)];
    const write = prior
      ? db
          .prepare(
            `UPDATE members SET data=? WHERE email=? AND data=? AND ${editorCheck}`,
          )
          .bind(JSON.stringify(m), email, prior.data, ...editorArgs)
      : db
          .prepare(
            `INSERT INTO members(id,email,data) SELECT ?,?,? WHERE ${editorCheck} ON CONFLICT(email) DO NOTHING`,
          )
          .bind(m.id, email, JSON.stringify(m), ...editorArgs);
    const event = JSON.stringify({
      memberId: m.id,
      previousRoles: existing?.roles ?? [],
      roles: m.roles,
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
    if (!result.meta.changes)
      throw new BusinessError(
        "Membership changed. Refresh People & access and try again.",
        409,
      );
    return json(m, 201);
  } catch (e) {
    return handleError(e);
  }
}
