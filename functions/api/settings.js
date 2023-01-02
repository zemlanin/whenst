import cookie from "cookie";
import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../_common/session-id.js";

const EMPTY_RESPONSE = { timezones: [] };

export async function onRequest(context) {
  const sessionId = await extractSessionIdFromCookie(context);
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("vary", "Cookie");

  if (!sessionId) {
    headers.set("Cache-Control", "public, max-age=14400");
    return new Response(JSON.stringify(EMPTY_RESPONSE), { headers });
  }

  headers.set("Cache-Control", "no-cache");

  const timezones = await context.env.KV.get(`timezones:${sessionId}`);

  if (!timezones) {
    return new Response(JSON.stringify(EMPTY_RESPONSE), { headers });
  }

  headers.set(
    "set-cookie",
    cookie.serialize(COOKIE_NAME, await getSessionCookie(context, sessionId), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      secure: !!context.env.CF_PAGES,
    })
  );
  return new Response(JSON.stringify({ timezones: JSON.parse(timezones) }), {
    headers,
  });
}
