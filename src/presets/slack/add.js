const url = require("url");

const nodeEmoji = require("node-emoji");
const sql = require("pg-template-tag").default;

const { escapeStatusText } = require("../../external/slack");

const EMOJI_REGEX = /:[a-z0-9+_'-]+:/;
const INSIDE_COLONS_REGEX = /:[^:]+:/;

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetAdd(req, res) {
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

  const db = await req.db();

  await db.query(sql`
    INSERT INTO slack_preset (
      slack_user_id,
      status_text,
      status_emoji
    )
    VALUES (
      ${user_oauth.user_id},
      ${status_text},
      ${status_emoji}
    )
    ON CONFLICT DO NOTHING
    RETURNING id;
  `);

  res.statusCode = 303;
  res.setHeader(
    "Location",
    url.resolve(
      req.absolute,
      req.app.routes.slackPresetsList.stringify({ user_id: user_oauth.user_id })
    )
  );
};
