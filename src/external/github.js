const querystring = require("querystring");

const bent = require("bent");

const config = require("../config.js");

const githubPost = bent("https://api.github.com/", "json", "POST");
const githubOauthPost = bent("https://github.com/login/oauth/", "json", "POST");

const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";
const APPLICATION_JSON = "application/json";

const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

module.exports = {
  DEFAULT_STATUS_EMOJI: "thought_balloon",
  // based on slack's escaping
  // https://api.slack.com/reference/surfaces/formatting#escaping
  escapeStatusText: (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  decodeStatusText: (str) =>
    str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
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
        emoji,
        message,
      },
    });

    return (await githubPost("graphql", encodedBody, headers)).data;
  },
};
