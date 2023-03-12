import { Validator } from "@cfworker/json-schema";
import cookie from "cookie";

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

// POST /sqrap/code
export async function onRequest(context) {
  const sessionId = await extractSessionIdFromCookie(context);
  const newSessionId = sessionId ? null : generateSessionId();

  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cache-control", "private, no-cache");

  const { code } = (await validateBody(context.request)) || {};

  if (!code) {
    return new Response(null, {
      status: 401,
      headers,
    });
  }

  const sessionIdForCodeRaw = await context.env.KV.get(
    `sqrap:${code}:sessionId`
  );
  if (!sessionIdForCodeRaw) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  }

  let account = sessionId ? await getAccount(context, sessionId) : null;
  if (!account) {
    account = await createAccount();
    await associateSessionWithAccount(
      context,
      sessionId || newSessionId,
      account
    );

    if (sessionId) {
      await moveDataFromSessionToAccount(context, sessionId, account.id);
    }
  }

  const sessionIdForCode = JSON.parse(sessionIdForCodeRaw);
  await context.env.KV.put(
    `sqrap:${code}:${sessionIdForCode}:account`,
    JSON.stringify(account),
    { expirationTtl: 60 * 5 }
  );

  const cookieValue = await getSessionCookie(
    context,
    sessionId || newSessionId
  );
  if (cookieValue) {
    headers.set(
      "set-cookie",
      cookie.serialize(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        secure: !!context.env.CF_PAGES,
      })
    );
  }

  return new Response(JSON.stringify({ code }), {
    status: 200,
    headers,
  });
}

const postCodeValidator = new Validator({
  properties: {
    code: {
      type: "string",
      minLength: 6,
      maxLength: 6,
    },
  },
  required: ["code"],
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
    request.method === "POST" ? postCodeValidator : alwaysInvalid
  ).validate(parsed);

  if (!valid) {
    return null;
  }

  if (request.method === "POST") {
    return {
      code: parsed.code.toUpperCase(),
    };
  }

  return null;
}
