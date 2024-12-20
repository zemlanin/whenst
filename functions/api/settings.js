import cookie from "cookie";

import { getAccount } from "../_common/account.js";
import {
  COOKIE_NAME,
  extractSessionIdFromCookie,
  getSessionCookie,
} from "../_common/session-id.js";

const EMPTY_RESPONSE = { timezones: [], signedIn: false };

// GET /settings
export async function onRequest(context) {
  const sessionId = await extractSessionIdFromCookie(context);
  const headers = new Headers();
  headers.set("content-type", "application/json");

  // > Cloudflare does not consider vary values in caching decisions
  // https://developers.cloudflare.com/cache/about/cache-control#other
  headers.set("vary", "Cookie");

  if (!sessionId) {
    headers.set("cache-control", "public, max-age=14400");
    return new Response(JSON.stringify(EMPTY_RESPONSE), { headers });
  }

  headers.set("cache-control", "private, no-cache");
  const account = await getAccount(context, sessionId);

  const timezones = await context.env.KV.get(
    `timezones:${account ? account.id : sessionId}`,
  );

  if (account || timezones?.length) {
    headers.set(
      "set-cookie",
      cookie.serialize(
        COOKIE_NAME,
        await getSessionCookie(context, sessionId),
        {
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
          secure: !!context.env.CF_PAGES,
        },
      ),
    );
  }

  if (!timezones) {
    return new Response(
      JSON.stringify({
        timezones: [],
        signedIn: !!account,
      }),
      { headers },
    );
  }

  return new Response(
    JSON.stringify({ timezones: JSON.parse(timezones), signedIn: true }),
    {
      headers,
    },
  );
}
