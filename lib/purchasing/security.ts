type SecurityOptions = { development?: boolean };

/** Protect hosted requests before authentication, database access or file handling. */
export async function serveSecureRequest(
  request: Request,
  serve: () => Response | Promise<Response>,
  { development = false }: SecurityOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  let response: Response;

  if (!development && url.protocol !== "https:") {
    if (
      url.protocol === "http:" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      url.protocol = "https:";
      response = new Response(null, {
        status: 308,
        headers: { Location: url.href, "Cache-Control": "no-store" },
      });
    } else {
      // Never forward an insecure write or attachment upload to the application.
      response = Response.json(
        { error: "HTTPS is required to send purchasing information." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  } else {
    response = await serve();
  }

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  if (!development && new URL(request.url).protocol === "https:") {
    // Apply only to this Site's hostname, without changing sibling Sites.
    headers.set("Strict-Transport-Security", "max-age=31536000");
    // Append a policy so any existing, stricter policy remains in force.
    headers.append("Content-Security-Policy", "upgrade-insecure-requests");
  }

  const contentType = headers.get("Content-Type")?.split(";", 1)[0].trim();
  if (
    url.pathname === "/" ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    contentType === "text/html" ||
    contentType === "text/x-component"
  ) {
    // Keep purchasing data out of shared caches and persistent browser caches.
    headers.set("Cache-Control", "private, no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
