const nodeEmoji = require("node-emoji");

const slackApi = require("../../external/slack.js");

module.exports = { emojiHTMLGetter, getProfile, getTeam, getTeamEmojis };

function emojiHTMLGetter(slacksEmojis) {
  function onMissing(name) {
    const customEmoji = slacksEmojis && slacksEmojis[name];

    if (customEmoji) {
      if (customEmoji.startsWith("alias:")) {
        return getEmojiHTML(`:${customEmoji.slice("alias:".length)}:`);
      } else {
        return `<img class="custom-emoji" src="${customEmoji}" alt="${name}" title=":${name}:">`;
      }
    }

    return `:${name}:`;
  }

  function getEmojiHTML(stringWithEmojis) {
    if (!stringWithEmojis) {
      return "";
    }

    return nodeEmoji.emojify(stringWithEmojis, onMissing);
  }

  return getEmojiHTML;
}

async function getProfile(db, redis, token, userId) {
  const apiMethod = "users.profile.get";
  const cacheKey = `slack:${apiMethod}:${userId}`;

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
