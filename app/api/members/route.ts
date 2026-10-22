import {
  body,
  context,
  database,
  json,
  handleError,
} from "@/lib/purchasing/server";
import { hasRole, BusinessError } from "@/lib/purchasing/domain";
import { DEPARTMENTS, ROLES, type Member } from "@/lib/purchasing/types";
export async function POST(req: Request) {
  try {
    const { me } = await context(req);
    if (!hasRole(me, "admin"))
      throw new BusinessError("Only the workspace owner can add members.", 403);
    const b = await body(req);
    const name = String(b.name ?? "")
        .trim()
        .slice(0, 150),
      email = String(b.email ?? "")
        .trim()
        .toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BusinessError("Enter a name and valid email.");
    if (!ROLES.includes(b.role) || b.role === "admin")
      throw new BusinessError("Choose a valid operational role.");
    if (b.role === "supervisor" && !DEPARTMENTS.includes(b.department))
      throw new BusinessError("Choose a supervisor department.");
    const prior = await database()
      .prepare("SELECT data FROM members WHERE email=?")
      .bind(email)
      .first<{ data: string }>();
    const existing: Member | undefined = prior
      ? JSON.parse(prior.data)
      : undefined;
    if (existing && (existing.demo || existing.roles.includes("admin")))
      throw new BusinessError(
        "The owner and sample personas cannot be changed with this form.",
      );
    const m: Member = {
      id: existing?.id ?? crypto.randomUUID(),
      ...(existing?.userId ? { userId: existing.userId } : {}),
      name,
      email,
      roles: [b.role],
      departments: b.role === "supervisor" ? [b.department] : [],
      demo: false,
    };
    await database()
      .prepare(
        "INSERT INTO members(id,email,data) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET data=excluded.data",
      )
      .bind(m.id, email, JSON.stringify(m))
      .run();
    return json(m, 201);
  } catch (e) {
    return handleError(e);
  }
}
