const url = require("url");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const slackApi = require("../external/slack.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function authSlack(req, res) {
  const query = req.query;

  const error = !query ? "something's wrong" : query.error;

  if (error) {
    res.statusCode = TODO_BAD_REQUEST;
    return error;
  }

  const code = query.code;
  const { client_id, client_secret } = config.slack;
  const redirect_uri = url.resolve(
    req.absolute,
    req.app.routes.authSlack.stringify()
  );

  const accessRequestBody = {
    code,
    client_id,
    client_secret,
    redirect_uri,
  };

  const slackResp = await slackApi.apiPost("oauth.access", accessRequestBody);

  if (slackResp.ok) {
    let slack_oauth_id;
    await req.db.transaction(async (db) => {
      const existingOauthResp = await db.query(sql`
        SELECT id, scopes, revoked from slack_oauth
        WHERE access_token = ${slackResp.access_token}
        LIMIT 1;
      `);

      let existing_oauth = existingOauthResp.rows[0];

      if (existing_oauth) {
        if (existing_oauth.revoked) {
          res.statusCode = TODO_BAD_REQUEST;
          return;
        }

        slack_oauth_id = existingOauthResp.rows[0].id;

        if (existing_oauth.scopes.join(",") !== slackResp.scope) {
          await db.query(sql`
            UPDATE slack_oauth
            SET scopes = ${slackResp.scope.split(",")}
            WHERE access_token = ${slackResp.access_token};
          `);
        }
      } else {
        const dbOauthResp = await db.query(sql`
          INSERT INTO
          slack_oauth (
            access_token,
            scopes,
            user_id,
            team_id,
            enterprise_id
          )
          VALUES (
            ${slackResp.access_token},
            ${slackResp.scope.split(",")},
            ${slackResp.user_id},
            ${slackResp.team_id},
            ${slackResp.enterprise_id}
          )
          RETURNING id;
        `);

        slack_oauth_id = dbOauthResp.rows[0].id;
      }
    });

    if (req.session.slack_oauth_ids) {
      req.session.slack_oauth_ids = [
        slack_oauth_id,
        // TODO: support multiple slacks per session
        // ...req.session.slack_oauth_ids.filter((id) => id !== slack_oauth_id),
      ];
    } else {
      req.session.slack_oauth_ids = [slack_oauth_id];
    }
  }

  res.statusCode = 302;
  res.setHeader(
    "Location",
    url.resolve(
      req.absolute,
      req.app.routes.slackPresetsList.stringify({
        user_id: slackResp.user_id,
      })
    )
  );
};
