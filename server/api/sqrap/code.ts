import * as cookie from "cookie";

import { getAccount } from "../../_common/account.js";
import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../../_common/session-id.js";
import { db } from "../../db/index.js";

import type { FastifyReply, FastifyRequest } from "fastify";

// POST /sqrap/code
export const apiSqrapCodePost = {
  handler: sqrapPost,
  schema: {
    body: {
      type: "object",
      properties: {
        code: {
          type: "string",
          minLength: 6,
          maxLength: 6,
        },
      },
      required: ["code"],
    },
  },
};

export async function sqrapPost(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);
  const account = sessionId ? getAccount(sessionId) : null;

  reply.header("cache-control", "private, no-cache");

  const { code } = request.body as { code: string };

  if (!code || !sessionId || !account) {
    reply.status(401);
    return reply.send(null);
  }

  const { session_id: sessionIdForCode } =
    db
      .prepare<
        { code: string },
        { session_id: string }
      >(`SELECT session_id FROM sqrap_states WHERE code = @code AND created_at > date('now', '-5 minutes')`)
      .get({ code }) || {};

  if (!sessionIdForCode) {
    reply.status(404);
    return reply.send({ error: "Not found" });
  }

  db.prepare<{ code: string; session_id: string; account_id: string }>(
    `UPDATE sqrap_states SET account_id = @account_id WHERE session_id = @session_id AND code = @code AND created_at > date('now', '-5 minutes')`,
  ).run({ code, session_id: sessionIdForCode, account_id: account.id });

  const cookieValue = await getSessionCookie(sessionId);
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

  return reply.send({ code });
}
