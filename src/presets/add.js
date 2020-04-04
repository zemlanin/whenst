const url = require("url");

const nodeEmoji = require("node-emoji");
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
    const emoji_name = nodeEmoji.which(req.body.status_emoji, true);

    if (emoji_name) {
      status_emoji = emoji_name;
    } else {
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
  }

  let status_text = req.body.status_text
    ? nodeEmoji.replace(
        escapeStatusText(req.body.status_text.trim()),
        (emoji) => `:${emoji.key}:`
      )
    : "";

  // if `status_emoji` is empty, Slack uses emoji-only `status_text` instead
  // so we're doing the same
  if (!status_emoji && status_text.match(EMOJI_REGEX)) {
    status_emoji = status_text;
    status_text = "";
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
      ${status_text},
      ${status_emoji}
    )
    ON CONFLICT DO NOTHING
    RETURNING id;
  `);

  res.writeHead(303, {
    Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
  });
};
