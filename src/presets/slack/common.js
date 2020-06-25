const nodeEmoji = require("node-emoji");

const slackApi = require("../../external/slack.js");

const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

module.exports = {
  emojiHTMLGetter,
  getProfile,
  getTeam,
  getTeamEmojis,
};

function emojiHTMLGetter(slacksEmojis) {
  function onMissing(name) {
    const customEmoji = slacksEmojis && slacksEmojis[name];

    if (customEmoji) {
      if (customEmoji.startsWith("alias:")) {
        return getEmojiHTML(customEmoji.slice("alias:".length), true).html;
      } else {
        return `<img class="custom-emoji" src="${customEmoji}" alt="${name}" title=":${name}:">`;
      }
    }

    // `unknown_emoji = result.startWith("<span")`
    //
    // this won't catch unknown emojis in status_text
    // because `unknown :xxxx: emoji` is a valid status
    return `<span class="not-found">:${name}:</span>`;
  }

  function getEmojiHTML(stringWithEmojis, wholeStringIsEmoji) {
    if (!stringWithEmojis) {
      return { html: "" };
    }

    if (wholeStringIsEmoji) {
      stringWithEmojis = `:${stringWithEmojis}:`;
    }

    const html = nodeEmoji.emojify(stringWithEmojis, onMissing);
    const unknown_emoji = html.startsWith("<span");

    if (unknown_emoji) {
      return { html, unknown_emoji };
    }

    return { html };
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
