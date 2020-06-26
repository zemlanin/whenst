const url = require("url");

const slackApi = require("../external/slack.js");
const githubApi = require("../external/github.js");
const { normalizeStatus } = require("../normalize-status.js");
const { getEmojiHTML } = require("../presets/common.js");

const TODO_BAD_REQUEST = 400;

async function bulkUse(req, res, user_oauths, status_emoji, status_text) {
  const redis = await req.redis();

  for (const user_oauth of user_oauths) {
    if (user_oauth.service === "slack") {
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
    } else if (user_oauth.service === "github") {
      const githubResp = await githubApi.setStatus(user_oauth.access_token, {
        emoji: status_emoji ? `:${status_emoji}:` : null,
        message: status_text ? status_text : "",
      });

      if (githubResp.message) {
        // TODO: report errors for bulk operations
        // throw new Error(githubResp.message);
      }
    }
  }
}

module.exports = async function statusUse(req, res) {
  const account = await req.getAccount();

  const user_oauths = [];

  let slack_oauth_ids = req.formBody.getAll("slack_oauth_id");
  if (slack_oauth_ids.length) {
    const slack_status_emoji = normalizeStatus(req.formBody, {
      behavior: normalizeStatus.BEHAVIOR.slack,
    }).status_emoji;

    if (
      slack_status_emoji &&
      getEmojiHTML(slack_status_emoji, true).custom_emoji
    ) {
      // TODO: report errors for bulk operations
      slack_oauth_ids = [];
    }
  }

  for (const oauth_id of slack_oauth_ids) {
    const user_oauth = account.oauths.find(
      (o) => o.service === "slack" && o.oauth_id === oauth_id
    );

    if (!user_oauth) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    user_oauths.push(user_oauth);
  }

  let github_oauth_ids = req.formBody.getAll("github_oauth_id");
  if (github_oauth_ids.length) {
    const github_status_emoji = normalizeStatus(req.formBody, {
      behavior: normalizeStatus.BEHAVIOR.github,
    }).status_emoji;

    if (
      github_status_emoji &&
      getEmojiHTML(github_status_emoji, true).custom_emoji
    ) {
      // TODO: report errors for bulk operations
      github_oauth_ids = [];
    }
  }

  for (const oauth_id of github_oauth_ids) {
    const user_oauth = account.oauths.find(
      (o) => o.service === "github" && o.oauth_id === oauth_id
    );

    if (!user_oauth) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    user_oauths.push(user_oauth);
  }

  const { status_emoji, status_text } = normalizeStatus(req.formBody);

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
