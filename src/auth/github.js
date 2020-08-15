const url = require("url");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const githubApi = require("../external/github.js");

const { parseOauthState } = require("./oauth-state.js");
const { encryptAccessToken } = require("./access-token-crypto.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function authGithub(req, res) {
  const query = new url.URL(req.url, req.absolute).searchParams;

  const error = query.get("error");

  if (error) {
    res.statusCode = TODO_BAD_REQUEST;
    return error;
  }

  const state = query.get("state");
  let nextURL = req.app.routes.landing.stringify();

  try {
    nextURL = parseOauthState(req.session.id, state);
  } catch (e) {
    if (!config.disableCSRFCheck) {
      res.statusCode = 302;

      res.setHeader(
        "Location",
        new url.URL(req.app.routes.landing.stringify(), req.absolute)
      );
      return;
    }
  }

  const account = await req.getAccount();
  const can_link_accounts = !account || account.oauths.length < 20;

  if (!can_link_accounts) {
    res.statusCode = 302;

    res.setHeader("Location", new url.URL(nextURL, req.absolute));
    return;
  }

  const code = query.get("code");
  const redirect_uri = new url.URL(
    req.app.routes.authGithub.stringify(),
    req.absolute
  );

  const githubResp = await githubApi.oauthAccessToken(
    code,
    redirect_uri.toString(),
    state
  );

  if (githubResp.access_token && githubResp.token_type === "bearer") {
    if (githubResp.token_type !== "bearer") {
      throw new Error(`unknown token_type: "${githubResp.token_type}"`);
    }

    const redis = await req.redis();

    const githubUser = await githubApi.getProfile(
      githubResp.access_token,
      redis
    );

    if (!githubUser.profile || !githubUser.profile.id) {
      throw new Error(`can't retrieve user`);
    }

    const encrypted_access_token = encryptAccessToken(githubResp.access_token);

    await req.db.transaction(async (db) => {
      const existingOauthResp = await db.query(sql`
        SELECT id, account_id, scopes
        FROM github_oauth
        WHERE user_id = ${githubUser.profile.id} AND revoked = false
        LIMIT 1;
      `);

      let existing_oauth = existingOauthResp.rows[0];

      if (existing_oauth) {
        if (existing_oauth.scopes.join(",") !== githubResp.scope) {
          await db.query(sql`
            UPDATE github_oauth
            SET
              scopes = ${githubResp.scope.split(",")},
              access_token = '',
              access_token_encrypted = ${encrypted_access_token.cipher},
              access_token_salt = ${encrypted_access_token.salt}
            WHERE id = ${existing_oauth.id};
          `);
        } else {
          await db.query(sql`
            UPDATE github_oauth
            SET
              access_token = '',
              access_token_encrypted = ${encrypted_access_token.cipher},
              access_token_salt = ${encrypted_access_token.salt}
            WHERE id = ${existing_oauth.id};
          `);
        }

        if (!account) {
          req.session.account_id = existing_oauth.account_id;
        } else if (account.id !== existing_oauth.account_id) {
          req.session.oauth_to_merge = {
            service: "github",
            oauth_id: existing_oauth.id,
          };
        }
      } else {
        let account_id = account && account.id;

        if (!account_id) {
          const dbAccountResp = await db.query(sql`
            INSERT INTO account DEFAULT VALUES RETURNING id;
          `);

          account_id = dbAccountResp.rows[0].id;

          req.session.account_id = account_id;
        }

        await db.query(sql`
          INSERT INTO
          github_oauth (
            account_id,
            access_token,
            access_token_encrypted,
            access_token_salt,
            scopes,
            user_id
          )
          VALUES (
            ${account_id},
            '',
            ${encrypted_access_token.cipher},
            ${encrypted_access_token.salt},
            ${githubResp.scope.split(",")},
            ${githubUser.profile.id}
          )
          RETURNING id;
        `);
      }
    });
  } else {
    console.error(githubResp.error);
  }

  res.statusCode = 302;

  if (req.session.oauth_to_merge) {
    res.setHeader("Location", req.app.routes.authMerge.stringify());
  } else {
    res.setHeader("Location", new url.URL(nextURL, req.absolute));
  }
};
