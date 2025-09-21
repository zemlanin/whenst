import * as cookie from "cookie";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  getSessionCookie,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";
import { db } from "../db/index.js";
import { FastifyReply, FastifyRequest } from "fastify";

const EMPTY_RESPONSE = { signedIn: false };

// GET /api/session
export async function apiSessionGet(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("vary", "Cookie");

  if (!sessionId) {
    reply.header("cache-control", "public, max-age=14400");
    return reply.send(EMPTY_RESPONSE);
  }

  reply.header("cache-control", "private, no-cache");
  reply.header(
    "set-cookie",
    cookie.serialize(COOKIE_NAME, await getSessionCookie(sessionId), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      secure: !!process.env.WHENST_SECURE_COOKIE,
    }),
  );

  const account = getAccount(sessionId);
  return reply.send({ signedIn: !!account });
}

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
