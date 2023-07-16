import cookie from "cookie";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  generateSessionId,
  getSessionCookie,
} from "../../_common/session-id.js";

// POST /sqrap/init
export async function onRequest(context) {
  const sessionId = await extractSessionIdFromCookie(context);
  const newSessionId = sessionId ? null : generateSessionId();

  const code = generateCode();

  await context.env.KV.put(
    `sqrap:${code}:sessionId`,
    JSON.stringify(sessionId || newSessionId),
    { expirationTtl: 60 * 5 },
  );

  const headers = new Headers();
  const cookieValue = await getSessionCookie(
    context,
    sessionId || newSessionId,
  );
  if (cookieValue) {
    headers.set(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        secure: !!context.env.CF_PAGES,
      }),
    );
  }

  return new Response(JSON.stringify({ code }), {
    status: 200,
    headers,
  });
}

function generateCode() {
  // cloudflare workers don't like `randomstring`
  const charset = "ABCDEFGHJKLMNPRSTVWXYZ23456789";

  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => charset[Math.floor((b * charset.length) / 256)])
    .join("");
}
