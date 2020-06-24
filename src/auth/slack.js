const url = require("url");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const slackApi = require("../external/slack.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function authSlack(req, res) {
  const query = new url.URL(req.url, req.absolute).searchParams;

  const error = query.get("error");

  if (error) {
    res.statusCode = TODO_BAD_REQUEST;
    return error;
  }

  const code = query.get("code");
  const { client_id, client_secret } = config.slack;
  const redirect_uri = new url.URL(
    req.app.routes.authSlack.stringify(),
    req.absolute
  );

  const accessRequestBody = {
    code,
    client_id,
    client_secret,
    redirect_uri: redirect_uri.toString(),
  };

  const slackResp = await slackApi.apiPost("oauth.access", accessRequestBody);

  if (slackResp.ok) {
    await req.db.transaction(async (db) => {
      const existingOauthResp = await db.query(sql`
        SELECT id, account_id, scopes, revoked from slack_oauth
        WHERE access_token = ${slackResp.access_token}
        LIMIT 1;
      `);

      let existing_oauth = existingOauthResp.rows[0];

      if (existing_oauth) {
        if (existing_oauth.revoked) {
          res.statusCode = TODO_BAD_REQUEST;
          return;
        }

        if (existing_oauth.scopes.join(",") !== slackResp.scope) {
          await db.query(sql`
            UPDATE slack_oauth
            SET scopes = ${slackResp.scope.split(",")}
            WHERE access_token = ${slackResp.access_token};
          `);
        }

        if (!req.session.account_id) {
          req.session.account_id = existing_oauth.account_id;
        } else if (req.session.account_id !== existing_oauth.account_id) {
          req.session.slack_oauth_id_to_merge = existing_oauth.id;
        }
      } else {
        let account_id = req.session.account_id;

        if (!account_id) {
          const dbAccountResp = await db.query(sql`
            INSERT INTO account DEFAULT VALUES RETURNING id;
          `);

          account_id = dbAccountResp.rows[0].id;

          req.session.account_id = account_id;
        }

        await db.query(sql`
          INSERT INTO
          slack_oauth (
            account_id,
            access_token,
            scopes,
            user_id,
            team_id,
            enterprise_id
          )
          VALUES (
            ${account_id},
            ${slackResp.access_token},
            ${slackResp.scope.split(",")},
            ${slackResp.user_id},
            ${slackResp.team_id},
            ${slackResp.enterprise_id}
          )
          RETURNING id;
        `);
      }
    });
  } else {
    console.error(slackResp.error);
  }

  res.statusCode = 302;

  if (req.session.slack_oauth_id_to_merge) {
    res.setHeader("Location", req.app.routes.authMerge.stringify());
  } else {
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );
  }
};
