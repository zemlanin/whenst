import * as cookie from "cookie";
import { FastifyReply, FastifyRequest } from "fastify";

import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../../_common/session-id.js";
import {
  DBCursor,
  deleteExistingTimezone,
  getSessionTimezonesChanges,
  upsertTimezone,
} from "../../db/index.js";
import { getAccount } from "../../_common/account.js";

export const apiSyncWorldClockGet = {
  handler: apiSyncWorldClockGetHandler,
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

async function apiSyncWorldClockGetHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("vary", "Cookie");

  if (!sessionId) {
    reply.status(401);
    return reply.send();
  }

  const { since, cursor } = request.query as {
    since?: string;
    cursor?: string;
  };

  reply.header("cache-control", "private, no-cache");
  const account = getAccount(sessionId);

  if (account) {
    reply.header(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, await getSessionCookie(sessionId), {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        secure: !!process.env.WHENST_SECURE_COOKIE,
      }),
    );
  }

  const changes = getSessionTimezonesChanges(
    sessionId,
    cursor ? DBCursor.from(cursor) : new DBCursor(since || "0", null),
  );

  if (!changes.rows.length) {
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
    }
  }

  return reply.send({
    changes: changes.rows,
    // TODO: use to store sync state on the client
    next: changes.next
      ? `/api/sync/world-clock?${new URLSearchParams({
          cursor: changes.next.toString(),
        })}`
      : null,
  });
}

export const apiSyncWorldClockPatch = {
  handler: apiSyncWorldClockPatchHandler,
  schema: {
    body: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 4,
                maxLength: 80,
              },
              timezone: {
                type: "string",
                minLength: 2,
                maxLength: 80,
              },
              label: {
                type: "string",
                minLength: 0,
                maxLength: 80,
              },
              updated_at: {
                type: "string",
                format: "date-time",
                pattern: "Z$", // UTC datetime
              },
              position: {
                type: "string",
                minLength: 1,
                pattern: "^[0-9A-Za-z]+$",
              },
              tombstone: {
                type: "number",
                const: 0,
              },
            },
            required: [
              "id",
              "timezone",
              "label",
              "updated_at",
              "position",
              "tombstone",
            ],
          },
          {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 4,
                maxLength: 80,
              },
              updated_at: {
                type: "string",
                format: "date-time",
                pattern: "Z$", // UTC datetime
              },
              tombstone: {
                type: "number",
                const: 1,
              },
            },
            required: ["id", "updated_at", "tombstone"],
          },
        ],
      },
    },
  },
};

async function apiSyncWorldClockPatchHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);
  if (!sessionId) {
    reply.status(401);
    return reply.send();
  }

  const body = request.body as (
    | {
        id: string;
        updated_at: string;
        tombstone: 0;
        timezone: string;
        label: string;
        position: string;
      }
    | { id: string; updated_at: string; tombstone: 1 }
  )[];

  if (!body.length) {
    return reply.send();
  }

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

  for (const patch of body) {
    if (patch.tombstone) {
      deleteExistingTimezone(patch, { accountId: account.id });
    } else {
      upsertTimezone(patch, { accountId: account.id });
    }
  }

  return reply.send();
}
