const url = require("url");
const sql = require("pg-template-tag").default;

const githubApi = require("../external/github.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function authGithub(req, res) {
  const query = new url.URL(req.url, req.absolute).searchParams;

  const error = query.get("error");

  if (error) {
    res.statusCode = TODO_BAD_REQUEST;
    return error;
  }

  const code = query.get("code");
  const redirect_uri = new url.URL(
    req.app.routes.authGithub.stringify(),
    req.absolute
  );
  const state = "";

  const githubResp = await githubApi.oauthAccessToken(
    code,
    redirect_uri.toString(),
    state
  );

  if (githubResp.access_token && githubResp.token_type === "bearer") {
    if (githubResp.token_type !== "bearer") {
      throw new Error(`unknown token_type: "${githubResp.token_type}"`);
    }

    const githubUser = await githubApi.getProfile(githubResp.access_token);

    if (!githubUser.profile || !githubUser.profile.id) {
      throw new Error(`can't retrieve user`);
    }

    await req.db.transaction(async (db) => {
      const existingOauthResp = await db.query(sql`
        SELECT id, account_id, scopes, revoked from github_oauth
        WHERE access_token = ${githubResp.access_token}
        LIMIT 1;
      `);

      let existing_oauth = existingOauthResp.rows[0];

      if (existing_oauth) {
        if (existing_oauth.revoked) {
          res.statusCode = TODO_BAD_REQUEST;
          return;
        }

        if (existing_oauth.scopes.join(",") !== githubResp.scope) {
          await db.query(sql`
            UPDATE github_oauth
            SET scopes = ${githubResp.scope.split(",")}
            WHERE access_token = ${githubResp.access_token};
          `);
        }

        if (!req.session.account_id) {
          req.session.account_id = existing_oauth.account_id;
        } else if (req.session.account_id !== existing_oauth.account_id) {
          req.session.oauth_to_merge = {
            service: "github",
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
          github_oauth (
            account_id,
            access_token,
            scopes,
            user_id
          )
          VALUES (
            ${account_id},
            ${githubResp.access_token},
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
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );
  }
};
