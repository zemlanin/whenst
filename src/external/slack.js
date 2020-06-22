const querystring = require("querystring");

const bent = require("bent");

const slackGet = bent("https://slack.com/api/", "json", "GET");
const slackPost = bent("https://slack.com/api/", "json", "POST");

const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";
const APPLICATION_JSON = "application/json";

module.exports = {
  // https://api.slack.com/reference/surfaces/formatting#escaping
  escapeStatusText: (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  decodeStatusText: (str) =>
    str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  apiGet: async function apiGet(apiMethod, body) {
    const encodedBody = body ? "?" + querystring.stringify(body) : "";

    return slackGet(`${apiMethod}${encodedBody}`);
  },
  DEFAULT_STATUS_EMOJI: "speech_balloon",
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
