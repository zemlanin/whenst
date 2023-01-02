import cookie from "cookie";
import { Validator } from "@cfworker/json-schema";

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

  const timezonesStr = await context.env.KV.get(`timezones:${sessionId}`);
  const timezones = JSON.parse(timezonesStr || "[]");

  let cookieValue;

  if (timezones.some((v) => v.id === newTimezone.id)) {
    cookieValue = await getSessionCookie(context, sessionId);
  } else {
    await context.env.KV.put(
      `timezones:${sessionId || newSessionId}`,
      JSON.stringify([newTimezone, ...timezones])
    );

    cookieValue = await getSessionCookie(context, sessionId || newSessionId);
  }

  const headers = new Headers();
  headers.set(
    "set-cookie",
    cookie.serialize(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      secure: !!context.env.CF_PAGES,
    })
  );

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

  const timezonesStr = await context.env.KV.get(`timezones:${sessionId}`);
  const timezones = JSON.parse(timezonesStr || "[]").filter(
    (v) => v.id !== deletedTimezone.id
  );

  if (timezones.length) {
    await context.env.KV.put(
      `timezones:${sessionId}`,
      JSON.stringify(timezones)
    );
  } else {
    await context.env.KV.delete(`timezones:${sessionId}`);
  }

  const headers = new Headers();
  const cookieValue = await getSessionCookie(context, sessionId);
  headers.set(
    "set-cookie",
    cookie.serialize(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      secure: !!context.env.CF_PAGES,
    })
  );

  return new Response(null, {
    status: 200,
    headers,
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
      minLength: 4,
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

  return null;
}
