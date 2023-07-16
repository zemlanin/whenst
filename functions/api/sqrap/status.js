import { associateSessionWithAccount } from "../../_common/account.js";
import { extractSessionIdFromCookie } from "../../_common/session-id.js";

// GET /sqrap/status
export async function onRequest(context) {
  const sessionId = await extractSessionIdFromCookie(context);

  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cache-control", "private, no-cache");

  if (!sessionId) {
    return new Response(
      { error: "Session data is required" },
      {
        status: 400,
        headers,
      },
    );
  }

  const code = new URL(context.request.url).searchParams.get("code");
  const sessionIdForCodeRaw = await context.env.KV.get(
    `sqrap:${code}:sessionId`,
  );
  if (!sessionIdForCodeRaw) {
    return new Response(JSON.stringify({ done: false, error: "Not found" }), {
      status: 404,
      headers,
    });
  }

  const sessionIdForCode = JSON.parse(sessionIdForCodeRaw);
  if (sessionIdForCode !== sessionId) {
    return new Response(JSON.stringify({ done: false, error: "Not found" }), {
      status: 404,
      headers,
    });
  }

  const newAccountRaw = await context.env.KV.get(
    `sqrap:${code}:${sessionId}:account`,
  );
  if (!newAccountRaw) {
    return new Response(JSON.stringify({ done: false, error: null }), {
      status: 200,
      headers,
    });
  }

  const newAccount = JSON.parse(newAccountRaw);
  await associateSessionWithAccount(context, sessionId, newAccount);

  await context.env.KV.delete(`sqrap:${code}:sessionId`);
  await context.env.KV.delete(`sqrap:${code}:${sessionId}:account`);
  await context.env.KV.delete(`timezones:${sessionId}`);

  return new Response(JSON.stringify({ done: true, error: null }), {
    headers,
  });
}
