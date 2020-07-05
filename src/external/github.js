const querystring = require("querystring");

const bent = require("bent");
const nodeEmoji = require("node-emoji");

const config = require("../config.js");
let githubEmoji = require("./github-emoji.js");

const githubPost = bent("https://api.github.com/", "json", "POST");
const githubOauthPost = bent("https://github.com/login/oauth/", "json", "POST");

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
    const headers = {
      "Content-Type": APPLICATION_FORM_URLENCODED,
      "User-Agent": "whenst",
      Accept: APPLICATION_JSON,
    };

    const encodedBody = querystring.stringify({
      client_id: config.github.client_id,
      client_secret: config.github.client_secret,
      code,
      redirect_uri,
      state,
    });

    return await githubOauthPost("access_token", encodedBody, headers);
  },

  getProfile: async function (token) {
    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "whenst",
      "Content-Type": APPLICATION_JSON,
    };

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

    const { data } = await githubPost("graphql", encodedBody, headers);
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

    return data;
  },

  setStatus: async function (token, { emoji, message }) {
    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "whenst",
      "Content-Type": APPLICATION_JSON,
    };

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

    return (await githubPost("graphql", encodedBody, headers)).data;
  },
};
