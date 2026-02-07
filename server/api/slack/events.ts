import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";
import "urlpattern-polyfill";

import { db } from "../../db/index.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../../../shared/from-timezone.js";
import { extractDataFromURL } from "../../../shared/extractDataFromURL.js";
import { parseTimeString } from "../../../shared/parseTimeString.js";

// POST /api/slack/events
export async function apiSlackEventsPost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!isValidSlackRequest(request)) {
    reply.status(401);
    return reply.send(null);
  }

  const body = request.body;
  if (!isEventMessage(body)) {
    reply.status(401);
    return reply.send(null);
  }

  if (isUrlVerificationBody(body)) {
    return reply.type("text/plain").send(body.challenge);
  }

  if (isLinkSharedBody(body)) {
    const r = reply.status(200).send(null);

    await sendChatUnfurl(body);

    return r;
  }

  if (isTokensRevokedBody(body)) {
    removeTokens(body);

    return reply.status(200).send(null);
  }

  return reply.status(200).send(null);
}

const SIGNING_SECRET = process.env.WHENST_SLACK_SIGNING_SECRET || "";

function isValidSlackRequest(request: FastifyRequest) {
  const timestamp = request.headers["x-slack-request-timestamp"];
  const slackSignature = request.headers["x-slack-signature"];
  if (
    !timestamp ||
    !slackSignature ||
    Array.isArray(timestamp) ||
    Array.isArray(slackSignature) ||
    Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 5 * 60
  ) {
    return false;
  }

  const sigBaseString = "v0:" + timestamp + ":" + request.rawBody;
  const serverSignature =
    "v0=" +
    createHmac("sha256", SIGNING_SECRET).update(sigBaseString).digest("hex");

  if (serverSignature.length !== slackSignature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(serverSignature),
    Buffer.from(slackSignature),
  );
}

function isUrlVerificationBody(body: unknown): body is { challenge: string } {
  return (
    isEventMessage(body) &&
    body.type === "url_verification" &&
    "challenge" in body &&
    typeof body.challenge === "string"
  );
}

type LinkSharedEvent = {
  type: "link_shared";
  user: string;
  channel: string;
  message_ts: string;
  links: {
    domain: string;
    url: string;
  }[];
  user_locale: string;
  source: string;
  unfurl_id: string;
  is_bot_user_member: boolean;
  event_ts: string;
};

function isLinkSharedBody(
  body: unknown,
): body is { team_id: string; event: LinkSharedEvent } {
  return (
    isEventMessage(body) &&
    body.type === "event_callback" &&
    "event" in body &&
    body.event !== null &&
    typeof body.event === "object" &&
    "type" in body.event &&
    body.event.type === "link_shared"
  );
}

type TokensRevokedEvent = {
  type: "tokens_revoked";
  tokens: {
    oauth: string[];
    bot: string[];
  };
};

function isTokensRevokedBody(
  body: unknown,
): body is { team_id: string; event: TokensRevokedEvent } {
  return (
    isEventMessage(body) &&
    body.type === "event_callback" &&
    "event" in body &&
    body.event !== null &&
    typeof body.event === "object" &&
    "type" in body.event &&
    body.event.type === "tokens_revoked"
  );
}

function isEventMessage(
  body: unknown,
): body is { type: string; token: string } {
  return (
    body !== null &&
    typeof body === "object" &&
    "type" in body &&
    typeof body.type === "string" &&
    "token" in body &&
    typeof body.token === "string"
  );
}

async function sendChatUnfurl({
  team_id,
  event,
}: {
  team_id: string;
  event: LinkSharedEvent;
}) {
  const { access_token } =
    db
      .prepare<{ team_id: string }, { access_token: string }>(
        `
          SELECT
            access_token
          FROM slack_oauth_tokens
          WHERE
            team_id = @team_id
          ORDER BY created_at DESC
          LIMIT 1;
        `,
      )
      .get({ team_id }) || {};

  if (!access_token) {
    return;
  }

  const unfurls: Record<string, { blocks: Record<string, unknown>[] }> = {};

  for (const link of event.links) {
    const [urlTZ, urlDT] = extractDataFromURL(link.url);
    if (!urlDT || urlDT === "now") {
      continue;
    }

    if (urlTZ === "unix") {
      // TODO: pass event's datetime when parsing time strings
      /** "zonedDateTime" */
      const zDT = parseTimeString(urlTZ, urlDT);

      const epochSeconds = Math.floor(zDT.epochMilliseconds / 1000);

      const canonicalPathname =
        getPathnameFromTimezone(urlTZ) + `/${epochSeconds}`;

      unfurls[link.url] = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<!date^${epochSeconds}^{date_long_pretty} at {time_secs}|:shrug:>`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<${new URL(canonicalPathname, "https://when.st/").toString()}|Unix ${epochSeconds}>`,
              },
            ],
          },
        ],
      };
    }

    if (urlTZ) {
      const placeStr = getLocationFromTimezone(urlTZ);
      // TODO: pass event's datetime when parsing time strings
      /** "zonedDateTime" */
      const zDT = parseTimeString(urlTZ, urlDT);

      const instantPathPart = zDT.toString({
        timeZoneName: "never",
        offset: "never",
        smallestUnit: "minute",
      });

      const canonicalPathname =
        getPathnameFromTimezone(urlTZ) + `/${instantPathPart}`;

      unfurls[link.url] = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<!date^${Math.floor(zDT.epochMilliseconds / 1000)}^{date_long_pretty} at {time}|:shrug:>`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<${new URL(canonicalPathname, "https://when.st/").toString()}|${instantPathPart} in ${placeStr}>`,
              },
            ],
          },
        ],
      };
    }

    // TODO: `/` (generic "about" description)
    continue;
  }

  if (!Object.keys(unfurls).length) {
    return;
  }

  const resp = await fetch("https://slack.com/api/chat.unfurl", {
    method: "post",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      source: event.source,
      unfurl_id: event.unfurl_id,
      unfurls,
    }),
  });

  if (!resp.ok) {
    console.error(await resp.json());
  }
}

function removeTokens({
  team_id,
  event,
}: {
  team_id: string;
  event: TokensRevokedEvent;
}) {
  const deleteStmt = db.prepare<{ team_id: string; bot_user_id: string }>(
    `
      DELETE FROM slack_oauth_tokens
      WHERE team_id = @team_id AND bot_user_id = @bot_user_id;
    `,
  );
  const deleteMany = db.transaction((bots: string[]) => {
    for (const bot_user_id of bots) {
      deleteStmt.run({ team_id, bot_user_id });
    }
  });

  deleteMany(event.tokens.bot);
}
