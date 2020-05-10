const url = require("url");

const sql = require("pg-template-tag").default;

const { processPresetForm } = require("./common.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetAdd(req, res) {
  const { status_emoji, status_text } = processPresetForm(req.formBody);

  if (!status_emoji && !status_text) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
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
    new url.URL(
      req.app.routes.slackPresetsList.stringify({
        user_id: user_oauth.user_id,
      }),
      req.absolute
    )
  );
};
