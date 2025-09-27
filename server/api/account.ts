import * as cookie from "cookie";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  getSessionCookie,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";
import { FastifyReply, FastifyRequest } from "fastify";

// GET /api/account
export async function apiAccountGet(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("vary", "Cookie");

  if (!sessionId) {
    reply.status(401);
    return reply.send();
  }

  reply.header("cache-control", "private, no-cache");

  const account = getAccount(sessionId);
  if (!account) {
    reply.header(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        secure: !!process.env.WHENST_SECURE_COOKIE,
      }),
    );
    reply.status(401);
    return reply.send();
  }

  reply.header(
    "set-cookie",
    cookie.serialize(COOKIE_NAME, await getSessionCookie(sessionId), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      secure: !!process.env.WHENST_SECURE_COOKIE,
    }),
  );
  return reply.send({ id: account.id });
}
