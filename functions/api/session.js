import cookie from "cookie";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";

// DELETE /session
export async function onRequest(context) {
  if (context.request.method !== "DELETE") {
    return new Response(null, { status: 400 });
  }

  const sessionId = await extractSessionIdFromCookie(context);
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cache-control", "private, no-cache");

  // > Cloudflare does not consider vary values in caching decisions
  // https://developers.cloudflare.com/cache/about/cache-control#other
  headers.set("vary", "Cookie");

  if (sessionId) {
    await context.env.KV.delete(`session:${sessionId}:account`);
    await context.env.KV.delete(`timezones:${sessionId}`);
    headers.set(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        secure: !!context.env.CF_PAGES,
      })
    );
  }

  return new Response(JSON.stringify({ done: true }), { headers });
}
