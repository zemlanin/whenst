const sql = require("pg-template-tag").default;

const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res) {
  let slacks = [];
  if (req.session.slack_oauth_ids) {
    const db = await req.db();

    const slack_oauth_ids = req.session.slack_oauth_ids;

    const dbRes = await db.query(sql`
      SELECT s.team_id, s.team_name, s.access_token FROM slack_oauth s
      WHERE s.id = ANY(${slack_oauth_ids})
    `);

    slacks = dbRes.rows.map((row) => ({
      team_name: row.team_name,
      team_id: row.team_id,
    }));
  }

  return res.render(tmpl, {
    session: req.session,
    slacks: slacks,
    client_id: config.slack.client_id,
    state: "", // TODO
  });
};
