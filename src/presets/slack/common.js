const slackApi = require("../../external/slack.js");

const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

module.exports = {
  getProfile,
  getTeam,
  getTeamEmojis,
};

async function getProfile(db, redis, token, userId) {
  const apiMethod = "users.profile.get";
  const cacheKey = `slack:${apiMethod}:${userId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await slackApi.apiGet(apiMethod, { token });

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

  const freshResp = await slackApi.apiGet(apiMethod, { token });

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

  const freshResp = await slackApi.apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}
