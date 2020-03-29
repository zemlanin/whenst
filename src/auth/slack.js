const url = require("url");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const slackApi = require("../external/slack.js");

module.exports = async function authSlack(req, res) {
  const query = req.query;

  const error = !query ? "something's wrong" : query.error;

  if (error) {
    res.writeHead(400);
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
    const db = await req.db();

    const dbOauthResp = await db.query(sql`
      INSERT INTO
      slack_oauth (
        access_token,
        scope,
        user_id,
        team_id,
        enterprise_id,
        team_name
      )
      VALUES (
        ${slackResp.access_token},
        ${slackResp.scope},
        ${slackResp.user_id},
        ${slackResp.team_id},
        ${slackResp.enterprise_id},
        ${slackResp.team_name}
      )
      ON CONFLICT (access_token) DO NOTHING
      RETURNING id;
    `);

    let slack_oauth_id;
    if (dbOauthResp.rows.length) {
      slack_oauth_id = dbOauthResp.rows[0].id;
    } else {
      const existingOauthResp = await db.query(sql`
        SELECT id from slack_oauth
        WHERE access_token = ${slackResp.access_token}
        LIMIT 1
      `)

      slack_oauth_id = existingOauthResp.rows[0].id;
    }

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

  return slackResp;
};
