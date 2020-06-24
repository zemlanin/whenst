const url = require("url");

const sql = require("pg-template-tag").default;

const TODO_BAD_REQUEST = 400;

module.exports = async function authUnlink(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (req.formBody.get("service") === "slack") {
    const slack_oauth_id = req.formBody.get("oauth_id");

    if (!slack_oauth_id) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    const db = await req.db();

    await db.query(sql`
      DELETE FROM slack_oauth
      WHERE account_id = ${account.id} AND id = ${slack_oauth_id};
    `);
  }

  res.statusCode = 302;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.settingsIndex.stringify(), req.absolute)
  );
};
