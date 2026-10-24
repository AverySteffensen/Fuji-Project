import { NextResponse } from "next/server";
import { serveSecureRequest } from "./lib/purchasing/security";

// Vinext includes this Next.js request middleware in the deployed server bundle.
export function proxy(request: Request) {
  return serveSecureRequest(request, () => NextResponse.next(), {
    development: import.meta.env?.DEV === true,
  });
}

export const config = { matcher: ["/", "/api/:path*"] };
