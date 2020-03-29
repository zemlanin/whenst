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

    if (body && bodyContentType === APPLICATION_FORM_URLENCODED) {
      encodedBody = querystring.stringify(body);
    } else if (body && bodyContentType === APPLICATION_JSON) {
      encodedBody = JSON.stringify(encodedBody);
    } else if (body) {
      throw new Error(
        `unknown "Content-Type" for a request body: "${bodyContentType}"`
      );
    }

    return slackPost(`${apiMethod}`, encodedBody, {
      "content-type": bodyContentType,
    });
  },
};
