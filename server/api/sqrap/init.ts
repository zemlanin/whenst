import * as cookie from "cookie";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  generateSessionId,
  getSessionCookie,
} from "../../_common/session-id.js";
import { FastifyReply, FastifyRequest } from "fastify";

// XXX
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const context: any = {};

// POST /sqrap/init
export async function apiSqrapInitPost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);
  const newSessionId = sessionId || generateSessionId();

  const code = generateCode();

  await context.env.KV.put(
    `sqrap:${code}:sessionId`,
    JSON.stringify(sessionId || newSessionId),
    { expirationTtl: 60 * 5 },
  );

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
