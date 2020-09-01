const url = require("url");

const slackApi = require("../external/slack.js");
const githubApi = require("../external/github.js");
const { queryPresetWithStatuses } = require("../presets/common.js");

module.exports = async function presetUse(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const preset_id = req.params.preset_id;

  if (!preset_id) {
    res.statusCode = 404;

    return;
  }

  const db = await req.db();

  const preset = await queryPresetWithStatuses(db, account, preset_id);

  if (!preset || !preset.statuses.length) {
    res.statusCode = 404;
    return;
  }

  const redis = await req.redis();

  for (const { oauth, status_emoji, status_text } of preset.statuses) {
    if (oauth.service === "slack") {
      const slackResp = await slackApi.apiPost(
        "users.profile.set",
        {
          token: oauth.access_token,
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
        console.error(`slackResp.message: ${slackResp.error}`);
        // TODO: report errors for bulk operations
        // throw new Error(slackResp.error);
      }

      const userId = oauth.user_id;
      await redis.del(`slack:users.profile.get:${userId}`);
    } else if (oauth.service === "github") {
      const githubResp = await githubApi.setStatus(oauth.access_token, {
        emoji: status_emoji ? `:${status_emoji}:` : null,
        message: status_text ? status_text : "",
      });

      if (githubResp.message) {
        console.error(`githubResp.message: ${githubResp.message}`);
        // TODO: report errors for bulk operations
        // throw new Error(githubResp.message);
      }

      const userId = oauth.user_id;
      await redis.del(`github:profile.viewer:${userId}`);
    } else {
      console.error(`unknown service: ${oauth.service}`);
    }
  }

  res.statusCode = 303;

  res.setHeader(
    "Location",
    new url.URL(
      req.app.routes.presetRead.stringify({ preset_id }),
      req.absolute
    )
  );
};
