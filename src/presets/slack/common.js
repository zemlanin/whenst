const nodeEmoji = require("node-emoji");

const slackApi = require("../../external/slack.js");

module.exports = {
  emojiHTMLGetter,
  getProfile,
  getTeam,
  getTeamEmojis,
  processPresetForm,
};

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

const EMOJI_REGEX = /^:[a-z0-9+_'-]+:$/;
const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

function processPresetForm(body) {
  let status_emoji = "";
  const body_status_emoji = body.get("status_emoji");
  const body_status_text = body.get("status_text");

  if (body_status_emoji) {
    const emoji_name = nodeEmoji.which(body_status_emoji, true);

    if (emoji_name) {
      status_emoji = emoji_name;
    } else {
      const status_emoji_inside_colons = body_status_emoji.match(
        INSIDE_COLONS_REGEX
      )
        ? body_status_emoji
        : `:${body_status_emoji}:`;

      if (!status_emoji_inside_colons.match(EMOJI_REGEX)) {
        return {};
      }

      status_emoji = status_emoji_inside_colons;
    }
  }

  let status_text = body_status_text
    ? nodeEmoji.replace(body_status_text.trim(), (emoji) => `:${emoji.key}:`)
    : "";

  // if `status_emoji` is empty, Slack uses emoji-only `status_text` instead
  // so we're doing the same
  if (!status_emoji && status_text.match(EMOJI_REGEX)) {
    status_emoji = status_text;
    status_text = "";
  } else if (!status_emoji && !status_text) {
    return {};
  } else if (!body_status_emoji) {
    return { status_emoji: slackApi.DEFAULT_STATUS_EMOJI, status_text };
  }

  return { status_emoji, status_text };
}
