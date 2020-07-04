const querystring = require("querystring");

const bent = require("bent");

const slackGet = bent("https://slack.com/api/", "json", "GET");
const slackPost = bent("https://slack.com/api/", "json", "POST");

const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";
const APPLICATION_JSON = "application/json";

const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

async function apiGet(apiMethod, body) {
  const encodedBody = body ? "?" + querystring.stringify(body) : "";

  return slackGet(`${apiMethod}${encodedBody}`);
}

async function getProfile(db, redis, token, userId) {
  const apiMethod = "users.profile.get";
  const cacheKey = `slack:${apiMethod}:${userId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await apiGet(apiMethod, { token });

  if (freshResp.ok) {
    if (
      freshResp.profile.status_emoji &&
      freshResp.profile.status_emoji.match(INSIDE_COLONS_REGEX)
    ) {
      freshResp.profile.status_emoji = freshResp.profile.status_emoji.slice(
        1,
        -1
      );
    }

    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

async function getTeam(db, redis, token, teamId) {
  const apiMethod = "team.info";
  const cacheKey = `slack:${apiMethod}:${teamId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

async function getTeamEmojis(db, redis, token, teamId) {
  const apiMethod = "emoji.list";
  const cacheKey = `slack:${apiMethod}:${teamId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

module.exports = {
  DEFAULT_STATUS_EMOJI: "speech_balloon",
  // https://api.slack.com/reference/surfaces/formatting#escaping
  escapeStatusText: (str) =>
    str &&
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  decodeStatusText: (str) =>
    str &&
    str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  getProfile,
  getTeam,
  getTeamEmojis,
  apiGet,
  apiPost: async function apiPost(
    apiMethod,
    body,
    bodyContentType = APPLICATION_FORM_URLENCODED
  ) {
    let encodedBody;

    const headers = {
      "Content-Type": bodyContentType,
    };

    if (body && bodyContentType === APPLICATION_FORM_URLENCODED) {
      if (body.client_id && body.client_secret) {
        const basicAuth = Buffer.from(
          `${body.client_id}:${body.client_secret}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${basicAuth}`;
        delete body.client_id;
        delete body.client_secret;
      }

      encodedBody = querystring.stringify(body);
    } else if (body && bodyContentType === APPLICATION_JSON) {
      if (body.token) {
        // https://api.slack.com/web#posting_json
        headers["Authorization"] = `Bearer ${body.token}`;

        delete body.token;
      }

      encodedBody = JSON.stringify(body);
    } else if (body) {
      throw new Error(
        `unknown "Content-Type" for a request body: "${bodyContentType}"`
      );
    }

    return slackPost(apiMethod, encodedBody, headers);
  },
};
