import { associateSessionWithAccount } from "../../_common/account.js";
import { extractSessionIdFromCookie } from "../../_common/session-id.js";
import { db } from "../../db/index.js";

import type { FastifyReply, FastifyRequest } from "fastify";

// GET /sqrap/status
export const apiSqrapStatusGet = {
  handler: sqrapStatus,
  schema: {
    querystring: {
      type: "object",
      properties: {
        code: { type: "string" },
      },
      required: ["code"],
    },
  },
};

async function sqrapStatus(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("cache-control", "private, no-cache");

  if (!sessionId) {
    reply.status(400);
    return reply.send({ error: "Session data is required" });
  }

  const { code } = request.query as { code: string };

  const row = db
    .prepare<
      { code: string; session_id: string },
      { account_id: string }
    >(`SELECT account_id FROM sqrap_states WHERE code = @code AND session_id = session_id AND created_at > date('now', '-5 minutes')`)
    .get({
      code: code.toUpperCase().trim(),
      session_id: sessionId,
    });

  if (!row) {
    reply.status(404);
    return reply.send({ done: false, error: "Not found" });
  }

  const { account_id } = row;

  if (!account_id) {
    return reply.send({ done: false, error: null });
  }

  associateSessionWithAccount(sessionId, account_id);

  db.prepare<{ session_id: string }>(
    `DELETE FROM sqrap_states WHERE session_id = @session_id`,
  ).run({
    session_id: sessionId,
  });

  db.prepare<{ session_id: string }>(
    `DELETE FROM session_settings WHERE session_id = @session_id`,
  ).run({
    session_id: sessionId,
  });

  return reply.send({ done: true, error: null });
}
