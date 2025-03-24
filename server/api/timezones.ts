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
  const timezones = sessionId ? (getSessionTimezones(sessionId) ?? []) : [];

  let cookieValue;

  if (timezones.every((v) => v.id !== newTimezone.id)) {
    if (account) {
      db.prepare<{ account_id: string; timezones: string }>(
        `INSERT INTO account_settings (account_id, timezones) VALUES (@account_id, @timezones)
          ON CONFLICT(account_id) DO UPDATE SET timezones = @timezones`,
      ).run({
        account_id: account.id,
        timezones: JSON.stringify([newTimezone, ...timezones]),
      });
    } else {
      if (!sessionId) {
        db.prepare<{ id: string }>(
          `INSERT INTO sessions (id) VALUES (@id) ON CONFLICT DO NOTHING`,
        ).run({ id: newSessionId });
      }

      db.prepare<{ session_id: string; timezones: string }>(
        `INSERT INTO session_settings (session_id, timezones) VALUES (@session_id, @timezones)
          ON CONFLICT(session_id) DO UPDATE SET timezones = @timezones`,
      ).run({
        session_id: newSessionId,
        timezones: JSON.stringify([newTimezone, ...timezones]),
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
    db.prepare(
      `UPDATE account_settings SET timezones = @timezones WHERE account_id = @account_id`,
    ).run({
      account_id: account.id,
      timezones: JSON.stringify(timezones),
    });
  } else {
    db.prepare(
      `UPDATE session_settings SET timezones = @timezones WHERE session_id = @session_id`,
    ).run({
      session_id: sessionId,
      timezones: JSON.stringify(timezones),
    });
  }

  return reply.send(null);
}

// PATCH /timezones
export const apiTimezonesPatch = {
  handler: patchTimezone,
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
        label: {
          type: "string",
          minLength: 0,
          maxLength: 80,
        },
      },
      required: ["id"],
    },
  },
};

async function patchTimezone(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = await extractSessionIdFromCookie(request);

  if (!sessionId) {
    return reply.send(null);
  }

  const { id, index, label } = request.body as {
    id: string;
    index?: number;
    label?: string;
  };

  if (!id) {
    reply.status(401);
    return reply.send(null);
  }

  if (index === undefined && label === undefined) {
    return reply.send(null);
  }

  const account = getAccount(sessionId);
  const oldTimezones = getSessionTimezones(sessionId) ?? [];

  const oldIndex = oldTimezones.findIndex((v) => v.id === id);
  if (oldIndex === -1 || oldIndex === index) {
    return reply.send(null);
  }

  const targetTimezone = { ...oldTimezones[oldIndex] };

  if (label !== undefined) {
    targetTimezone.label = label;
  }

  const timezones = (() => {
    const cutIndex = index === undefined ? oldIndex : index;
    const timezonesWithoutTargetItem = oldTimezones.filter(
      (v) => v.id !== targetTimezone.id,
    );

    return [
      ...timezonesWithoutTargetItem.slice(0, cutIndex),
      targetTimezone,
      ...timezonesWithoutTargetItem.slice(cutIndex),
    ];
  })();

  if (account) {
    db.prepare(
      `UPDATE account_settings SET timezones = @timezones WHERE account_id = @account_id`,
    ).run({
      account_id: account.id,
      timezones: JSON.stringify(timezones),
    });
  } else {
    db.prepare(
      `UPDATE session_settings SET timezones = @timezones WHERE session_id = @session_id`,
    ).run({
      session_id: sessionId,
      timezones: JSON.stringify(timezones),
    });
  }

  return reply.send(null);
}
