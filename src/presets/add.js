const url = require("url");

const sql = require("pg-template-tag").default;

const EMOJI_REGEX = /:[a-z0-9+_'-]+:/;
const INSIDE_COLONS_REGEX = /:[^:]+:/;

const TODO_BAD_REQUEST = 400;

// https://api.slack.com/reference/surfaces/formatting#escaping
const escapeStatusText = (str) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function slackPresetAdd(req, res) {
  const slack_oauth_ids = req.session.slack_oauth_ids;

  if (!slack_oauth_ids || !slack_oauth_ids.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (!slack_oauth_ids.includes(req.body.slack_oauth_id)) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  let status_emoji = "";
  if (req.body.status_emoji) {
    const status_emoji_inside_colons = req.body.status_emoji.match(
      INSIDE_COLONS_REGEX
    )
      ? req.body.status_emoji
      : `:${req.body.status_emoji}:`;

    if (!status_emoji_inside_colons.match(EMOJI_REGEX)) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    status_emoji = status_emoji_inside_colons;
  }

  const db = await req.db();
  await db.query(sql`
    INSERT INTO slack_preset (
      slack_oauth_id,
      status_text,
      status_emoji
    )
    VALUES (
      ${req.body.slack_oauth_id},
      ${escapeStatusText(req.body.status_text)},
      ${status_emoji}
    )
    ON CONFLICT DO NOTHING
    RETURNING id;
  `);

  res.writeHead(303, {
    Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
  });
};
