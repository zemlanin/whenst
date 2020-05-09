const url = require("url");

const slackApi = require("../../external/slack.js");
const { processPresetForm } = require("./common.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetUse(req, res) {
  const slackOauths = await req.getSlackOauths();

  if (!slackOauths.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const user_oauth = slackOauths.find((o) => o.user_id === req.params.user_id);
  if (!user_oauth) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const { status_emoji, status_text } = processPresetForm(req.body);

  if (!status_emoji && !status_text) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const slackResp = await slackApi.apiPost(
    "users.profile.set",
    {
      token: user_oauth.access_token,
      profile: {
        status_text: slackApi.escapeStatusText(status_text),
        status_emoji: status_emoji,
      },
    },
    "application/json"
  );

  if (slackResp.error) {
    throw new Error(slackResp.error);
  }

  const redis = await req.redis();
  const userId = user_oauth.user_id;
  await redis.del(`slack:users.profile.get:${userId}`);

  res.statusCode = 303;
  res.setHeader(
    "Location",
    url.resolve(
      req.absolute,
      req.app.routes.slackPresetsList.stringify({ user_id: userId })
    )
  );
};
