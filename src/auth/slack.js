const url = require("url");
const querystring = require("querystring");

const bent = require("bent");
const sql = require("pg-template-tag").default;

const config = require("../config.js");

const slackApi = bent("https://slack.com/api/", "json", "POST");

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

  const accessRequestBody = querystring.stringify({
    code,
    client_id,
    client_secret,
    redirect_uri
  });

  const slackResp = await slackApi("oauth.access", accessRequestBody, {
    "content-type": "application/x-www-form-urlencoded"
  });

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
      ON CONFLICT (access_token) DO UPDATE SET
        scope = EXCLUDED.scope,
        team_name = EXCLUDED.team_name
      RETURNING id;
    `);

    const slack_oauth_id = dbOauthResp.rows[0].id;

    req.session.slack_oauth_ids = [
      slack_oauth_id,
      ...(req.session.slack_oauth_ids || [])
    ];
  }

  return slackResp;
};
