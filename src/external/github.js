const querystring = require("querystring");

const fetch = require("node-fetch");
const nodeEmoji = require("node-emoji");

const config = require("../config.js");
let githubEmoji = require("./github-emoji.js");

const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";
const APPLICATION_JSON = "application/json";

const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

const githubEmojiImportMapping = {};
const githubEmojiExportMapping = {};

for (const nameFromGithub of Object.keys(githubEmoji)) {
  if (nodeEmoji.hasEmoji(nameFromGithub)) {
    continue;
  }

  const imgUrl = githubEmoji[nameFromGithub];

  const codepointMatch = imgUrl.match(
    /\/icons\/emoji\/unicode\/([0-9a-f-]+)\.png/
  );

  if (!codepointMatch) {
    continue;
  }

  const emojiParts = codepointMatch[1]
    .split("-")
    .map((codepoint) => String.fromCodePoint(parseInt(codepoint, 16)));

  const nameFromNodeEmoji =
    nodeEmoji.which(emojiParts.join("")) ||
    // _person -> _woman
    nodeEmoji.which(emojiParts.join("") + "\u{200D}\u{2640}\u{FE0F}") ||
    nodeEmoji.which(emojiParts.join("\u{200D}")) ||
    nodeEmoji.which(emojiParts[0]) ||
    null;

  if (nameFromNodeEmoji) {
    githubEmojiImportMapping[nameFromGithub] = nameFromNodeEmoji;
    githubEmojiExportMapping[nameFromNodeEmoji] = nameFromGithub;
  }
}

githubEmoji = null;
delete require.cache[require.resolve("./github-emoji.js")];

function importEmoji(str) {
  if (!str) {
    return str;
  }

  const wrapInColons = !!str.match(INSIDE_COLONS_REGEX);

  if (wrapInColons) {
    str = str.slice(1, -1);
  }

  if (githubEmojiImportMapping[str]) {
    str = githubEmojiImportMapping[str];
  }

  return wrapInColons ? `:${str}:` : str;
}

function exportEmoji(str) {
  if (!str) {
    return str;
  }

  const wrapInColons = !!str.match(INSIDE_COLONS_REGEX);

  if (wrapInColons) {
    str = str.slice(1, -1);
  }

  if (githubEmojiExportMapping[str]) {
    str = githubEmojiExportMapping[str];
  }

  return wrapInColons ? `:${str}:` : str;
}

module.exports = {
  DEFAULT_STATUS_EMOJI: "thought_balloon",
  // based on slack's escaping
  // https://api.slack.com/reference/surfaces/formatting#escaping
  escapeStatusText: (str) =>
    str &&
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  decodeStatusText: (str) =>
    str &&
    str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  importEmoji,
  exportEmoji,
  oauthAccessToken: async function (code, redirect_uri, state) {
    const encodedBody = querystring.stringify({
      client_id: config.github.client_id,
      client_secret: config.github.client_secret,
      code,
      redirect_uri,
      state,
    });

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        body: encodedBody,
        headers: {
          "Content-Type": APPLICATION_FORM_URLENCODED,
          Accept: APPLICATION_JSON,
        },
      }
    );

    return await response.json();
  },

  getProfile: async function (token, redis, userId) {
    let cacheKey;

    if (redis) {
      cacheKey = `github:profile.viewer:${userId}`;
      const cachedResp = await redis.get(cacheKey);

      if (cachedResp) {
        return JSON.parse(cachedResp);
      }
    }

    const encodedBody = JSON.stringify({
      query: `
        {
          profile: viewer {
            id: databaseId
            login
            name
            image_72: avatarUrl(size: 72)
            status {
              emoji
              message
            }
          }
        }
      `,
    });

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      body: encodedBody,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": APPLICATION_JSON,
      },
    });

    const { data } = await response.json();
    if (data.profile.status?.emoji?.match(INSIDE_COLONS_REGEX)) {
      data.profile.status.emoji = data.profile.status.emoji.slice(1, -1);
    }

    if (data.profile.status?.emoji) {
      data.profile.status.emoji = importEmoji(data.profile.status.emoji);
    }

    if (data.profile.status?.message) {
      data.profile.status.message = module.exports.escapeStatusText(
        data.profile.status.message
      );
    }

    if (redis) {
      cacheKey = `github:profile.viewer:${data.profile.id}`;
      await redis.set(cacheKey, JSON.stringify(data), "EX", 60 * 60);
    }

    return data;
  },

  setStatus: async function (token, { emoji, message }) {
    const encodedBody = JSON.stringify({
      query: `
        mutation ($message: String, $emoji: String) {
          changeUserStatus(input: {message: $message, emoji: $emoji}) {
            clientMutationId
            status {
              message
              emoji
            }
          }
        }
      `,
      variables: {
        emoji: exportEmoji(emoji),
        message,
      },
    });

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      body: encodedBody,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": APPLICATION_JSON,
      },
    });

    const { data } = await response.json();

    return data;
  },
};
