const url = require("url");
const crypto = require("crypto");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const slackApi = require("../external/slack.js");

const { encryptAccessToken } = require("./access-token-crypto.js");

const TODO_BAD_REQUEST = 400;

const getOauthState = (session) =>
  crypto.createHash("sha256").update(session.id).digest("hex");

module.exports = async function authSlack(req, res) {
  const query = new url.URL(req.url, req.absolute).searchParams;

  const error = query.get("error");

  if (error) {
    res.statusCode = TODO_BAD_REQUEST;
    return error;
  }

  const state = query.get("state");

  if (state != getOauthState(req.session)) {
    res.statusCode = 302;

    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
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
    const encrypted_access_token = encryptAccessToken(slackResp.access_token);

    await req.db.transaction(async (db) => {
      const existingOauthResp = await db.query(sql`
        SELECT id, account_id, scopes, revoked
        FROM slack_oauth
        WHERE user_id = ${slackResp.user_id}
          AND team_id = ${slackResp.team_id}
          AND revoked = false
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
            SET
              scopes = ${slackResp.scope.split(",")},
              access_token = '',
              access_token_encrypted = ${encrypted_access_token.cipher},
              access_token_salt = ${encrypted_access_token.salt}
            WHERE id = ${existing_oauth.id};
          `);
        } else {
          await db.query(sql`
            UPDATE slack_oauth
            SET
              access_token = '',
              access_token_encrypted = ${encrypted_access_token.cipher},
              access_token_salt = ${encrypted_access_token.salt}
            WHERE id = ${existing_oauth.id};
          `);
        }

        if (!req.session.account_id) {
          req.session.account_id = existing_oauth.account_id;
        } else if (req.session.account_id !== existing_oauth.account_id) {
          req.session.oauth_to_merge = {
            service: "slack",
            oauth_id: existing_oauth.id,
          };
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
            access_token_encrypted,
            access_token_salt,
            scopes,
            user_id,
            team_id,
            enterprise_id
          )
          VALUES (
            ${account_id},
            '',
            ${encrypted_access_token.cipher},
            ${encrypted_access_token.salt}
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

  if (req.session.oauth_to_merge) {
    res.setHeader("Location", req.app.routes.authMerge.stringify());
  } else {
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );
  }
};
