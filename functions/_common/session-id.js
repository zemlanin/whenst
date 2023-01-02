import cookie from "cookie";

export const COOKIE_NAME = "__session";

export async function extractSessionIdFromCookie(context) {
  const parsedCookie = cookie.parse(
    context.request.headers.get("Cookie") || ""
  );

  const str = parsedCookie[COOKIE_NAME];

  if (!str) {
    return null;
  }

  const [id, signature] = str.split(".");

  if (!id || !signature) {
    return null;
  }

  let sigRaw;
  try {
    sigRaw = atob(signature);
  } catch (e) {
    return null;
  }

  const key = await importKey(context.env.SESSION_SECRET);
  const sigBuf = Uint8Array.from(sigRaw, (c) => c.charCodeAt(0));

  if (!(await crypto.subtle.verify("HMAC", key, sigBuf, id))) {
    return null;
  }

  return id;
}

export function generateSessionId() {
  return crypto.randomUUID();
}

export async function getSessionCookie(context, sessionId) {
  const key = await importKey(context.env.SESSION_SECRET);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sessionId)
  );

  return `${sessionId}.${btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )}`;
}

async function importKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
