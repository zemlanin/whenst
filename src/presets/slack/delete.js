const url = require("url");

const sql = require("pg-template-tag").default;

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetDelete(req, res) {
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
    DELETE FROM slack_preset
    WHERE id = ${req.body.id}
      AND slack_user_id = ${user_oauth.user_id}
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
