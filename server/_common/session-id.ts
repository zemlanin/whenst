import * as cookie from "cookie";

import type { FastifyRequest } from "fastify";

export const COOKIE_NAME = "__session";
const SESSION_SECRET = process.env.WHENST_SESSION_SECRET ?? "secret";

export async function extractSessionIdFromCookie(request: FastifyRequest) {
  const parsedCookie = cookie.parse(request.headers.cookie || "");

  const str = parsedCookie[COOKIE_NAME];

  if (!str) {
    return null;
  }

  const [sessionId, signature] = str.split(".");

  if (!sessionId || !signature) {
    return null;
  }

  let sigRaw;
  try {
    sigRaw = atob(signature);
  } catch (_e) {
    return null;
  }

  const key = await importKey(SESSION_SECRET);
  const sigBuf = Uint8Array.from(sigRaw, (c) => c.charCodeAt(0));

  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf,
      new TextEncoder().encode(sessionId),
    ))
  ) {
    return null;
  }

  return sessionId;
}

export function generateSessionId() {
  return crypto.randomUUID();
}

export async function getSessionCookie(sessionId: string) {
  const key = await importKey(SESSION_SECRET);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sessionId),
  );

  return `${sessionId}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )}`;
}

async function importKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
