import * as cookie from "cookie";

import {
  associateSessionWithAccount,
  createAccount,
  getAccount,
} from "../_common/account.js";
import {
  COOKIE_NAME,
  getSessionCookie,
  extractSessionIdFromCookie,
  generateSessionId,
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

// POST /api/account
export async function apiAccountPost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);
  const newSessionId = sessionId || generateSessionId();

  reply.header("cache-control", "private, no-cache");

  if (sessionId && getAccount(sessionId)) {
    reply.status(401);
    return reply.send({ error: "session already has an account" });
  }

  const newAccount = createAccount();
  associateSessionWithAccount(sessionId || newSessionId, newAccount.id);

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

  return reply.send({ done: true });
}
