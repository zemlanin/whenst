const nodeEmoji = require("node-emoji");

const slackApi = require("../../external/slack.js");

const EMOJI_REGEX = /^[a-z0-9+_'-]+$/;
const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

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

function processPresetForm(body) {
  let status_emoji = "";
  const body_status_emoji = body.get("status_emoji");
  const body_status_text = body.get("status_text");

  if (body_status_emoji) {
    const emoji_name = nodeEmoji.which(body_status_emoji, false);

    if (emoji_name) {
      status_emoji = emoji_name;
    } else {
      const status_emoji_without_colons = body_status_emoji.match(
        INSIDE_COLONS_REGEX
      )
        ? body_status_emoji.slice(1, -1)
        : body_status_emoji;

      if (!status_emoji_without_colons.match(EMOJI_REGEX)) {
        return {};
      }

      status_emoji = status_emoji_without_colons;
    }
  }

  let status_text = body_status_text
    ? nodeEmoji.replace(body_status_text.trim(), (emoji) => `:${emoji.key}:`)
    : "";

  // if `status_emoji` is empty, Slack uses emoji-only `status_text` instead
  // so we're doing the same
  if (
    !status_emoji &&
    status_text.match(INSIDE_COLONS_REGEX) &&
    status_text.slice(1, -1).match(EMOJI_REGEX)
  ) {
    status_emoji = status_text.slice(1, -1);
    status_text = "";
  } else if (!status_emoji && !status_text) {
    return {};
  } else if (!body_status_emoji) {
    return {
      status_emoji: slackApi.DEFAULT_STATUS_EMOJI,
      status_text,
      default_status_emoji: true,
    };
  }

  return { status_emoji, status_text };
}
