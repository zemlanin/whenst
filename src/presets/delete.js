const url = require("url");

const sql = require("pg-template-tag").default;

const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetDelete(req, res) {
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
  await db.query(sql`
    DELETE FROM slack_preset
    WHERE id = ${req.body.id}
      AND slack_oauth_id = ${req.body.slack_oauth_id}
  `);

  res.writeHead(303, {
    Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
  });
};
