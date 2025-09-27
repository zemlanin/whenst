import * as cookie from "cookie";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";
import { db } from "../db/index.js";
import { FastifyReply, FastifyRequest } from "fastify";

// DELETE /api/session
export async function apiSessionDelete(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);
  reply.header("cache-control", "private, no-cache");
  reply.header("vary", "Cookie");

  if (sessionId) {
    db.prepare<string>(`DELETE FROM sessions WHERE id = ?`).run(sessionId);

    reply.header(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        secure: !!process.env.WHENST_SECURE_COOKIE,
      }),
    );
  }

  return reply.send({ done: true });
}
