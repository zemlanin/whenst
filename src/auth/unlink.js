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
      UPDATE slack_oauth
      SET revoked = true,
          access_token = '',
          access_token_encrypted = null,
          access_token_salt = null
      WHERE account_id = ${account.id} AND id = ${slack_oauth_id};
    `);
  } else if (req.formBody.get("service") === "github") {
    const github_oauth_id = req.formBody.get("oauth_id");

    if (!github_oauth_id) {
      res.statusCode = TODO_BAD_REQUEST;

      return;
    }

    const db = await req.db();

    await db.query(sql`
      UPDATE github_oauth
      SET revoked = true,
          access_token = '',
          access_token_encrypted = null,
          access_token_salt = null
      WHERE account_id = ${account.id} AND id = ${github_oauth_id};
    `);
  }

  res.statusCode = 303;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.settingsIndex.stringify(), req.absolute)
  );
};
