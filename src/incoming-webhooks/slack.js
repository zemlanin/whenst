const crypto = require("crypto");

const config = require("../config.js");

const TODO_BAD_REQUEST = 400;

const FIVE_MINUTES = 5 * 60 * 1000;

async function eventCallback(req) {
  const event = req.body.get("event");

  if (event.type === "user_change") {
    const redis = await req.redis();
    const userId = event.user.id;
    await redis.del(`slack:users.profile.get:${userId}`);
    return;
  }

  if (event.type === "emoji_changed") {
    const redis = await req.redis();
    const teamId = req.body.get("team_id");
    await redis.del(`slack:emoji.list:${teamId}`);
    return;
  }

  if (event.type === "team_rename") {
    const redis = await req.redis();
    const teamId = req.body.get("team_id");
    await redis.del(`slack:team.info:${teamId}`);
    return;
  }
}

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

  if (!req.body.get("type")) {
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

  switch (req.body.get("type")) {
    case "url_verification":
      return { challenge: req.body.get("challenge") };
    case "event_callback":
      await eventCallback(req);
      return {};
    default:
      res.statusCode = TODO_BAD_REQUEST;
      return;
  }
};
