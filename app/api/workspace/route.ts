import { loadWorkspace, json, handleError } from "@/lib/purchasing/server";
export async function GET(req: Request) {
  try {
    return json(await loadWorkspace(req));
  } catch (e) {
    return handleError(e);
  }
}
