const url = require("url");

const sql = require("pg-template-tag").default;

const slackApi = require("../external/slack.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetUse(req, res) {
  const slack_oauth_ids = req.session.slack_oauth_ids;

  if (!slack_oauth_ids || !slack_oauth_ids.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (!slack_oauth_ids.includes(req.body.slack_oauth_id)) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const db = await req.db();

  const dbOauthResp = await db.query(sql`
    SELECT s.id, s.user_id, s.access_token FROM slack_oauth s
    WHERE s.id = ${req.body.slack_oauth_id} AND s.revoked = false
    LIMIT 1
  `);

  const oauth = dbOauthResp.rows[0];

  if (!oauth) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const dbPresetResp = await db.query(sql`
    SELECT id, status_text, status_emoji FROM slack_preset
    WHERE id = ${req.body.id}
      AND slack_user_id = ${oauth.user_id}
    LIMIT 1
  `);

  const preset = dbPresetResp.rows[0];

  if (!preset) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const slackResp = await slackApi.apiPost(
    "users.profile.set",
    {
      token: oauth.access_token,
      profile: {
        status_text: preset.status_text || "",
        status_emoji: preset.status_emoji || "",
      },
    },
    "application/json"
  );

  if (slackResp.error) {
    throw new Error(slackResp.error);
  }

  const redis = await req.redis();
  const userId = oauth.user_id;
  await redis.del(`slack:users.profile.get:${userId}`);

  res.writeHead(303, {
    Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
  });
};
