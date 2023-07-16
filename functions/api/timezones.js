import cookie from "cookie";
import { Validator } from "@cfworker/json-schema";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  generateSessionId,
  getSessionCookie,
  extractSessionIdFromCookie,
} from "../_common/session-id.js";

export async function onRequest(context) {
  switch (context.request.method) {
    case "PUT":
      return addTimezone(context);
    case "DELETE":
      return deleteTimezone(context);
    case "PATCH":
      return reorderTimezone(context);
  }

  return new Response(null, { status: 400 });
}

async function addTimezone(context) {
  const sessionId = await extractSessionIdFromCookie(context);
  const newSessionId = sessionId ? null : generateSessionId();

  const newTimezone = await validateBody(context.request);

  if (newTimezone === null) {
    return new Response(null, { status: 400 });
  }

  const account = await getAccount(context, sessionId);
  const timezonesStr = await context.env.KV.get(
    `timezones:${account ? account.id : sessionId}`,
  );
  const timezones = JSON.parse(timezonesStr || "[]");

  let cookieValue;

  if (timezones.every((v) => v.id !== newTimezone.id)) {
    await context.env.KV.put(
      `timezones:${(account ? account.id : sessionId) || newSessionId}`,
      JSON.stringify([newTimezone, ...timezones]),
    );

    cookieValue = await getSessionCookie(context, sessionId || newSessionId);
  }

  const headers = new Headers();
  if (cookieValue) {
    headers.set(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        secure: !!context.env.CF_PAGES,
      }),
    );
  }

  return new Response(null, {
    status: 200,
    headers,
  });
}

async function deleteTimezone(context) {
  const sessionId = await extractSessionIdFromCookie(context);

  if (!sessionId) {
    return new Response(null, { status: 200 });
  }

  const deletedTimezone = await validateBody(context.request);

  if (deletedTimezone === null) {
    return new Response(null, { status: 400 });
  }

  const account = await getAccount(context, sessionId);
  const timezonesKey = `timezones:${account ? account.id : sessionId}`;

  const timezonesStr = await context.env.KV.get(timezonesKey);
  const timezones = JSON.parse(timezonesStr || "[]").filter(
    (v) => v.id !== deletedTimezone.id,
  );

  if (timezones.length) {
    await context.env.KV.put(timezonesKey, JSON.stringify(timezones));
  } else {
    await context.env.KV.delete(timezonesKey);
  }

  return new Response(null, {
    status: 200,
  });
}

async function reorderTimezone(context) {
  const sessionId = await extractSessionIdFromCookie(context);

  if (!sessionId) {
    return new Response(null, { status: 200 });
  }

  const { id, index } = (await validateBody(context.request)) || {};

  if (!id) {
    return new Response(null, { status: 401 });
  }

  const account = await getAccount(context, sessionId);
  const timezonesKey = `timezones:${account ? account.id : sessionId}`;

  const timezonesStr = await context.env.KV.get(timezonesKey);
  const oldTimezones = JSON.parse(timezonesStr || "[]");

  const oldIndex = oldTimezones.findIndex((v) => v.id === id);
  if (oldIndex === -1 || oldIndex === index) {
    return new Response(null, {
      status: 200,
    });
  }

  const movedTimezone = oldTimezones[oldIndex];

  let timezonesWithoutMovedItem = oldTimezones.filter(
    (v) => v.id !== movedTimezone.id,
  );

  const timezones = [
    ...timezonesWithoutMovedItem.slice(0, index),
    movedTimezone,
    ...timezonesWithoutMovedItem.slice(index),
  ];

  await context.env.KV.put(timezonesKey, JSON.stringify(timezones));

  return new Response(null, {
    status: 200,
  });
}

const addBodyValidator = new Validator({
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
});

const deleteBodyValidator = new Validator({
  properties: {
    id: {
      type: "string",
      minLength: 4,
      maxLength: 80,
    },
  },
  required: ["id"],
});

const reorderBodyValidator = new Validator({
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
});

const alwaysInvalid = {
  validate() {
    return false;
  },
};

async function validateBody(request) {
  let parsed;

  try {
    parsed = await request.json();
  } catch (e) {
    return null;
  }

  if (!parsed) {
    return null;
  }

  const valid = (
    request.method === "PUT"
      ? addBodyValidator
      : request.method === "DELETE"
      ? deleteBodyValidator
      : request.method === "PATCH"
      ? reorderBodyValidator
      : alwaysInvalid
  ).validate(parsed);

  if (!valid) {
    return null;
  }

  if (request.method === "PUT") {
    return {
      id: parsed.id,
      timezone: parsed.timezone,
      label: parsed.label,
    };
  }

  if (request.method === "DELETE") {
    return {
      id: parsed.id,
    };
  }

  if (request.method === "PATCH") {
    return {
      id: parsed.id,
      index: parsed.index,
    };
  }

  return null;
}
