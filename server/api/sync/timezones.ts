import * as cookie from "cookie";
import { FastifyReply, FastifyRequest } from "fastify";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../../_common/session-id.js";
import { DBCursor, getSessionTimezonesChanges } from "../../db/index.js";

export const apiSyncTimezonesGet = {
  handler: apiSyncTimezonesGetHandler,
  schema: {
    querystring: {
      type: "object",
      properties: {
        since: { type: "string" },
        cursor: { type: "string" },
      },
    },
  },
};

async function apiSyncTimezonesGetHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("vary", "Cookie");

  if (!sessionId) {
    reply.header("cache-control", "public, max-age=14400");
    return reply.send({
      changes: [],
    });
  }

  const { since, cursor } = request.query as {
    since?: string;
    cursor?: string;
  };

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

  const changes = getSessionTimezonesChanges(
    sessionId,
    cursor ? DBCursor.from(cursor) : new DBCursor(since || "0", null),
  );

  return reply.send({
    changes: changes.rows,
    next: changes.next
      ? `/api/sync/timezones?${new URLSearchParams({
          cursor: changes.next.toString(),
        })}`
      : null,
  });
}
