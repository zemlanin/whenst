import { FastifyReply, FastifyRequest } from "fastify";
import { associateSessionWithAccount } from "../../_common/account.js";
import { extractSessionIdFromCookie } from "../../_common/session-id.js";

// XXX
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const context: any = {};

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
    reply.send({ error: "Session data is required" });
    return;
  }

  const { code } = request.query as { code: string };

  const sessionIdForCodeRaw = await context.env.KV.get(
    `sqrap:${code}:sessionId`,
  );
  if (!sessionIdForCodeRaw) {
    reply.status(404);
    reply.send({ done: false, error: "Not found" });
    return;
  }

  const sessionIdForCode = JSON.parse(sessionIdForCodeRaw);
  if (sessionIdForCode !== sessionId) {
    reply.status(404);
    reply.send({ done: false, error: "Not found" });
    return;
  }

  const newAccountRaw = await context.env.KV.get(
    `sqrap:${code}:${sessionId}:account`,
  );
  if (!newAccountRaw) {
    reply.send({ done: false, error: null });
    return;
  }

  const newAccount = JSON.parse(newAccountRaw);
  associateSessionWithAccount(sessionId, newAccount);

  await context.env.KV.delete(`sqrap:${code}:sessionId`);
  await context.env.KV.delete(`sqrap:${code}:${sessionId}:account`);
  await context.env.KV.delete(`timezones:${sessionId}`);

  return reply.send({ done: true, error: null });
}
