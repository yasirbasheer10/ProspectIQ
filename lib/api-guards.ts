import type { NextRequest } from "next/server";

/**
 * Guards for the destructive JSON POST routes under `/api`.
 *
 * Next's server actions get CSRF protection from the framework. Plain route
 * handlers do not: `/api/demo/reset` was a bare `POST()` that read the caller's
 * session cookie and deleted every company, ICP, offer, sequence and agent run
 * in their workspace. Any page anywhere could trigger it — an `<img>` can't POST,
 * but a hidden auto-submitting form can, and cookies ride along.
 */

export class RequestRejectedError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestRejectedError";
    this.status = status;
  }
}

/**
 * Rejects the two ways a cross-site page can make a browser POST here.
 *
 * A plain HTML form can only send `application/x-www-form-urlencoded`,
 * `multipart/form-data` or `text/plain`, so requiring JSON rules it out
 * entirely. `fetch` can send JSON, but only after a preflight the browser
 * refuses without CORS headers — and it always attaches an `Origin`, so
 * comparing it to the request's own host closes that path too.
 */
export function assertSameOriginJson(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestRejectedError("This endpoint requires a Content-Type of application/json.", 415);
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    // Same-origin `fetch` from the app always sends one. A missing Origin means
    // the caller is not a browser page, which is not what this route is for.
    throw new RequestRejectedError("This endpoint requires a same-origin request.", 403);
  }

  const host = req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new RequestRejectedError("This endpoint requires a same-origin request.", 403);
  }

  if (!host || originHost !== host) {
    throw new RequestRejectedError("This endpoint requires a same-origin request.", 403);
  }
}

/**
 * Requires the caller to spell out what they are about to destroy.
 *
 * The point is not secrecy — the token is in the client source. It's that the
 * request cannot be made by accident, by a replayed URL, or by a cross-site
 * form that has no way to know the current body shape.
 */
export async function requireConfirmation(req: NextRequest, expected: string): Promise<void> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new RequestRejectedError("Expected a JSON body.", 400);
  }

  const confirm = (body as { confirm?: unknown } | null)?.confirm;
  if (typeof confirm !== "string" || confirm !== expected) {
    throw new RequestRejectedError(
      `This action is destructive. Send {"confirm":"${expected}"} to proceed.`,
      400
    );
  }
}
