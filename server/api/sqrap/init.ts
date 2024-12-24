import * as cookie from "cookie";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  generateSessionId,
  getSessionCookie,
} from "../../_common/session-id.js";
import { db } from "../../db/index.js";

import type { FastifyReply, FastifyRequest } from "fastify";

// POST /sqrap/init
export async function apiSqrapInitPost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);
  const newSessionId = sessionId || generateSessionId();

  const code = generateCode();

  db.prepare<{ code: string; session_id: string }>(
    `INSERT INTO sqrap_states (code, session_id) VALUES (@code, @session_id)`,
  ).run({
    code,
    session_id: newSessionId,
  });

  const cookieValue = await getSessionCookie(sessionId || newSessionId);
  if (cookieValue) {
    reply.header(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        secure: !!process.env.WHENST_SECURE_COOKIE,
      }),
    );
  }

  reply.send({ code });
}

function generateCode() {
  // cloudflare workers don't like `randomstring`
  const charset = "ABCDEFGHJKLMNPRSTVWXYZ23456789";

  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => charset[Math.floor((b * charset.length) / 256)])
    .join("");
}
