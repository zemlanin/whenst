const url = require("url");

const nodeEmoji = require("node-emoji");

const slackApi = require("../external/slack.js");
const {
  processPresetForm,
  getTeamEmojis,
} = require("../presets/slack/common.js");

const TODO_BAD_REQUEST = 400;

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji);

async function bulkUse(req, res, user_oauths, status_emoji, status_text) {
  const db = await req.db();
  const redis = await req.redis();

  for (const user_oauth of user_oauths) {
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
          status_text: status_text
            ? slackApi.escapeStatusText(status_text)
            : "",
          status_emoji: status_emoji ? `:${status_emoji}:` : null,
        },
      },
      "application/json"
    );

    if (slackResp.error) {
      // TODO: report errors for bulk operations
      // throw new Error(slackResp.error);
    }

    const userId = user_oauth.user_id;
    await redis.del(`slack:users.profile.get:${userId}`);
  }
}

module.exports = async function statusUse(req, res) {
  const account = await req.getAccount();

  const slackOauths = account.oauths.filter((o) => o.service === "slack");

  if (!slackOauths.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const oauth_ids = req.formBody.getAll("oauth_id");
  const user_oauths = [];

  for (const oauth_id of oauth_ids) {
    const user_oauth = slackOauths.find((o) => o.oauth_id === oauth_id);

    if (!user_oauth) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    user_oauths.push(user_oauth);
  }

  const { status_emoji, status_text } = processPresetForm(req.formBody);

  await bulkUse(req, res, user_oauths, status_emoji, status_text);

  res.statusCode = 303;

  if (!status_text && !status_emoji) {
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );
  } else {
    const query = new url.URLSearchParams({
      status_text: status_text || "",
      status_emoji: status_emoji || "",
    });

    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.statusIndex.stringify() + "?" + query.toString(),
        req.absolute
      )
    );
  }
};
