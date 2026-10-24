import { context, database, json, handleError } from "@/lib/purchasing/server";
import { queryRegister, readFilters } from "@/lib/purchasing/register-server";
export async function GET(req: Request) {
  try {
    const { me } = await context(req);
    const url = new URL(req.url);
    const integer = (s: string | null, fallback: number, max: number) =>
      Math.min(
        max,
        Math.max(
          1,
          Number.isFinite(Number(s)) && s ? Math.floor(Number(s)) : fallback,
        ),
      );
    return json(
      await queryRegister(
        database(),
        me,
        readFilters(url),
        integer(url.searchParams.get("page"), 1, 1_000_000),
        integer(url.searchParams.get("size"), 25, 100),
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
