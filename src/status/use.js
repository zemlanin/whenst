const url = require("url");

const nodeEmoji = require("node-emoji");

const slackApi = require("../external/slack.js");
const {
  processPresetForm,
  getTeamEmojis,
} = require("../presets/slack/common.js");

const TODO_BAD_REQUEST = 400;

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji);

module.exports = async function statusUse(req, res) {
  const slackOauths = await req.getSlackOauths();

  if (!slackOauths.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const user_oauth = slackOauths.find(
    (o) => o.oauth_id === req.formBody.get("oauth_id")
  );
  if (!user_oauth) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const { status_emoji, status_text } = processPresetForm(req.formBody);

  const db = await req.db();
  const redis = await req.redis();
  const { emoji: teamEmoji } = await getTeamEmojis(
    db,
    redis,
    user_oauth.access_token,
    user_oauth.team_id
  );

  if (status_emoji) {
    const isCommonEmoji = DEFAULT_EMOJI_LIST.some(
      (name) => name === status_emoji
    );

    if (!isCommonEmoji) {
      if (!Object.keys(teamEmoji).some((name) => name === status_emoji)) {
        res.statusCode = TODO_BAD_REQUEST;

        return;
      }
    }
  }

  const slackResp = await slackApi.apiPost(
    "users.profile.set",
    {
      token: user_oauth.access_token,
      profile: {
        status_text: status_text ? slackApi.escapeStatusText(status_text) : "",
        status_emoji: status_emoji ? `:${status_emoji}:` : null,
      },
    },
    "application/json"
  );

  if (slackResp.error) {
    throw new Error(slackResp.error);
  }

  const userId = user_oauth.user_id;
  await redis.del(`slack:users.profile.get:${userId}`);

  res.statusCode = 303;
  res.setHeader(
    "Location",
    new url.URL(
      req.app.routes.slackPresetsList.stringify({
        oauth_id: user_oauth.oauth_id,
      }),
      req.absolute
    )
  );
};
