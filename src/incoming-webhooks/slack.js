const crypto = require("crypto");

const config = require("../config.js");

const TODO_BAD_REQUEST = 400;

const FIVE_MINUTES = 5 * 60 * 1000;

module.exports = async function incomingWebhookSlack(req, res) {
  const slackSignature = req.headers["x-slack-signature"];
  const slackRequestTimestamp = req.headers["x-slack-request-timestamp"];

  if (!slackSignature || !slackRequestTimestamp) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (
    !new Date(slackRequestTimestamp * 1000) ||
    new Date() - new Date(slackRequestTimestamp * 1000) > FIVE_MINUTES
  ) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (!req.rawBody) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (!req.body.type) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const sigBasestring = "v0:" + slackRequestTimestamp + ":" + req.rawBody;

  const signatureHmac = crypto.createHmac(
    "sha256",
    config.slack.signing_secret
  );

  signatureHmac.update(sigBasestring);

  const expectedSignature = "v0=" + signatureHmac.digest("hex");

  if (expectedSignature.length !== slackSignature.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(slackSignature)
    )
  ) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  switch (req.body.type) {
    case "url_verification":
      return { challenge: req.body.challenge };
    case "event_callback":
      console.log(req.body.event);
      return {};
    default:
      res.statusCode = TODO_BAD_REQUEST;
      return;
  }
};
