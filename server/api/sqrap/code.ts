import * as cookie from "cookie";

import {
  getAccount,
  createAccount,
  associateSessionWithAccount,
  moveDataFromSessionToAccount,
} from "../../_common/account.js";
import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  generateSessionId,
  getSessionCookie,
} from "../../_common/session-id.js";
import { FastifyReply, FastifyRequest } from "fastify";

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

// XXX
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const context: any = {};

export async function sqrapPost(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);
  const newSessionId = sessionId || generateSessionId();

  reply.header("cache-control", "private, no-cache");

  const { code } = request.body as { code: string };

  if (!code) {
    reply.status(401);
    return reply.send(null);
  }

  const sessionIdForCodeRaw = await context.env.KV.get(
    `sqrap:${code}:sessionId`,
  );
  if (!sessionIdForCodeRaw) {
    reply.status(404);
    return reply.send({ error: "Not found" });
  }

  let account = sessionId ? getAccount(sessionId) : null;
  if (!account) {
    account = createAccount();
    associateSessionWithAccount(sessionId || newSessionId, account.id);

    if (sessionId) {
      moveDataFromSessionToAccount(sessionId, account.id);
    }
  }

  const sessionIdForCode = JSON.parse(sessionIdForCodeRaw);
  await context.env.KV.put(
    `sqrap:${code}:${sessionIdForCode}:account`,
    JSON.stringify(account),
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
