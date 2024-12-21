import * as cookie from "cookie";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  generateSessionId,
  getSessionCookie,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { db, getSessionTimezones } from "../db/index.js";

// PUT /timezones
export const apiTimezonesPut = {
  handler: addTimezone,
  schema: {
    body: {
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
      },
      required: ["id", "timezone", "label"],
    },
  },
};

async function addTimezone(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);
  const newTimezone = request.body as {
    id: string;
    timezone: string;
    label: string;
  };

  if (newTimezone === null) {
    reply.status(400);
    return reply.send(null);
  }

  const newSessionId = sessionId || generateSessionId();

  const account = sessionId ? getAccount(sessionId) : null;
  const timezones = sessionId ? getSessionTimezones(sessionId) : [];

  let cookieValue;

  if (timezones?.every((v) => v.id !== newTimezone.id)) {
    if (account) {
      db.prepare(
        `INSERT INTO accounts (id, timezones) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET timezones = ?2`,
      ).run({
        1: account.id,
        2: [newTimezone, ...timezones],
      });
    } else {
      db.prepare(
        `INSERT INTO accounts (id, timezones) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET timezones = ?2`,
      ).run({
        1: newSessionId,
        2: [newTimezone, ...timezones],
      });
    }

    cookieValue = await getSessionCookie(newSessionId);
  }

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

  return reply.send(null);
}

// DELETE /timezones
export const apiTimezonesDelete = {
  handler: deleteTimezone,
  schema: {
    body: {
      type: "object",
      properties: {
        id: {
          type: "string",
          minLength: 4,
          maxLength: 80,
        },
      },
      required: ["id"],
    },
  },
};

async function deleteTimezone(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);

  if (!sessionId) {
    return reply.send(null);
  }

  const deletedTimezone = request.body as { id: string };

  if (deletedTimezone === null) {
    reply.status(400);
    return reply.send(null);
  }

  const account = getAccount(sessionId);
  const timezones =
    getSessionTimezones(sessionId)?.filter(
      (v) => v.id !== deletedTimezone.id,
    ) ?? [];

  if (account) {
    db.prepare(`UPDATE accounts SET timezones = ?2 WHERE id = ?1`).run({
      1: account.id,
      2: timezones,
    });
  } else {
    db.prepare(`UPDATE sessions SET timezones = ?2 WHERE id = ?1`).run({
      1: sessionId,
      2: timezones,
    });
  }

  reply.send(null);
}

// PATCH /timezones
export const apiTimezonesPatch = {
  handler: reorderTimezone,
  schema: {
    body: {
      type: "object",
      properties: {
        id: {
          type: "string",
          minLength: 4,
          maxLength: 80,
        },
        index: {
          type: "integer",
          minimum: 0,
        },
      },
      required: ["id", "index"],
    },
  },
};

async function reorderTimezone(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);

  if (!sessionId) {
    return reply.send(null);
  }

  const { id, index } = request.body as { id: string; index: number };

  if (!id) {
    reply.status(401);
    return reply.send(null);
  }

  const account = getAccount(sessionId);
  const oldTimezones = getSessionTimezones(sessionId) ?? [];

  const oldIndex = oldTimezones.findIndex((v) => v.id === id);
  if (oldIndex === -1 || oldIndex === index) {
    return reply.send(null);
  }

  const movedTimezone = oldTimezones[oldIndex];

  const timezonesWithoutMovedItem = oldTimezones.filter(
    (v) => v.id !== movedTimezone.id,
  );

  const timezones = [
    ...timezonesWithoutMovedItem.slice(0, index),
    movedTimezone,
    ...timezonesWithoutMovedItem.slice(index),
  ];

  if (account) {
    db.prepare(`UPDATE accounts SET timezones = ?2 WHERE id = ?1`).run({
      1: account.id,
      2: timezones,
    });
  } else {
    db.prepare(`UPDATE sessions SET timezones = ?2 WHERE id = ?1`).run({
      1: sessionId,
      2: timezones,
    });
  }

  return reply.send(null);
}
