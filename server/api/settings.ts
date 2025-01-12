import * as cookie from "cookie";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../_common/session-id.js";
import { getSessionTimezones } from "../db/index.js";
import { FastifyReply, FastifyRequest } from "fastify";

const EMPTY_RESPONSE = { timezones: [], signedIn: false };

// GET /settings
export async function apiSettingsGet(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionId = await extractSessionIdFromCookie(request);

  reply.header("vary", "Cookie");

  if (!sessionId) {
    reply.header("cache-control", "public, max-age=14400");
    return reply.send(EMPTY_RESPONSE);
  }

  reply.header("cache-control", "private, no-cache");
  const account = getAccount(sessionId);
  const timezones = getSessionTimezones(sessionId);

  if (account || timezones?.length) {
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

  if (!timezones) {
    return reply.send({
      timezones: [],
      signedIn: !!account,
    });
  }

  return reply.send({ timezones: timezones, signedIn: true });
}
