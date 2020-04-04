const querystring = require("querystring");

const bent = require("bent");

const slackGet = bent("https://slack.com/api/", "json", "GET");
const slackPost = bent("https://slack.com/api/", "json", "POST");

const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";
const APPLICATION_JSON = "application/json";

module.exports = {
  apiGet: async function apiGet(apiMethod, body) {
    const encodedBody = body ? "?" + querystring.stringify(body) : "";

    return slackGet(`${apiMethod}${encodedBody}`);
  },
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
      encodedBody = querystring.stringify(body);
    } else if (body && bodyContentType === APPLICATION_JSON) {
      encodedBody = JSON.stringify(body);

      if (body.token) {
        // https://api.slack.com/web#posting_json
        headers["Authorization"] = `Bearer ${body.token}`;

        delete body.token;
      }
    } else if (body) {
      throw new Error(
        `unknown "Content-Type" for a request body: "${bodyContentType}"`
      );
    }

    return slackPost(apiMethod, encodedBody, headers);
  },
};
