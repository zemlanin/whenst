import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";
import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";

import { db } from "../../db/index.js";
import { guessTimezone } from "../../../src/guess-timezone.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../../../shared/from-timezone.js";

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

    if (urlTZ instanceof Temporal.TimeZone) {
      const placeStr = getLocationFromTimezone(urlTZ);
      const instant = parseTimeString(urlTZ, urlDT);

      const instantPathPart = instant.toString({
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
              text: `<!date^${instant.epochSeconds}^{date_long_pretty} at {time}|:shrug:>`,
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

    // TODO: `/unix/:seconds`
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

const serverCalendar = "iso8601";

function parseTimeString(
  timezone: string | Temporal.TimeZone,
  timeString: string | undefined,
) {
  if (timezone === "unix") {
    timezone = "UTC";
  }

  let date = undefined;
  if (timeString) {
    try {
      date = Temporal.PlainDate.from(timeString);
    } catch (_e) {
      //
    }
  }

  if (!date) {
    date = Temporal.Now.plainDate(serverCalendar);
  }

  if (timeString && timeString !== "now") {
    try {
      Temporal.PlainTime.from(timeString);
    } catch (_e) {
      timeString = "now";
    }
  }

  return !timeString || timeString === "now"
    ? Temporal.Now.zonedDateTime(serverCalendar, timezone).with({
        millisecond: 0,
      })
    : date.toZonedDateTime({
        plainTime: Temporal.PlainTime.from(timeString),
        timeZone: timezone,
      });
}

function extractDataFromURL(
  href: string,
): [] | [string | Temporal.TimeZone, string] {
  const unixURLPattern = new URLPattern(
    {
      pathname: "/unix{/:seconds(\\d*)}?",
    },
    // https://github.com/kenchris/urlpattern-polyfill/issues/127
    { ignoreCase: true } as unknown as string,
  );
  const matchesUnix = unixURLPattern.test(href);
  if (matchesUnix) {
    const { seconds } = unixURLPattern.exec(href)?.pathname.groups ?? {};

    if (!seconds || !seconds.match(/^[0-9]{1,10}$/)) {
      return ["unix", "now"];
    }

    return ["unix", new Date(+seconds * 1000).toISOString().replace(/Z$/, "")];
  }

  const geoURLPattern = new URLPattern({
    pathname: "/:zeroth{/*}?",
  });

  const matchesGeo = geoURLPattern.test(href);
  if (!matchesGeo) {
    return [];
  }

  const { zeroth, 0: extra } = geoURLPattern.exec(href)?.pathname.groups || {
    zeroth: "",
  };

  if (zeroth === "") {
    return [];
  }

  const [first, second, third] = extra?.split("/") ?? [];

  let remoteTZ = guessTimezone(`${zeroth}/${first}/${second}`, {
    strict: true,
  });
  if (remoteTZ) {
    return [remoteTZ, third || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}/${first}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, second || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, first || "now"];
  }

  return [];
}
