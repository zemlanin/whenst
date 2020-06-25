const url = require("url");
const sql = require("pg-template-tag").default;

const { getAccount } = require("./account.js");

const tmpl = require.resolve("./templates/merge.handlebars");

async function performMerge(req, res) {
  const activeAccount = await req.getAccount();
  if (
    !activeAccount ||
    !req.session.oauth_to_merge ||
    !req.session.oauth_to_merge.oauth_id
  ) {
    res.statusCode = 404;
    return;
  }

  const shouldProceed = req.formBody.get("action") === "proceed";

  const cleanupMerge = () => {
    delete req.session.oauth_to_merge;

    res.statusCode = 303;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );

    return;
  };

  if (!shouldProceed) {
    return cleanupMerge();
  }

  const oauth_to_merge = req.session.oauth_to_merge;

  const db = await req.db();

  let dbOauthRes = null;

  if (oauth_to_merge.service === "slack") {
    dbOauthRes = (
      await db.query(sql`
        SELECT id, account_id
        FROM slack_oauth
        WHERE id = ${oauth_to_merge.oauth_id}
        LIMIT 1;
      `)
    ).rows[0];
  } else if (oauth_to_merge.service === "github") {
    dbOauthRes = (
      await db.query(sql`
        SELECT id, account_id
        FROM github_oauth
        WHERE id = ${oauth_to_merge.oauth_id}
        LIMIT 1;
      `)
    ).rows[0];
  }

  if (!dbOauthRes) {
    return cleanupMerge();
  }

  const redis = await req.redis();

  const accountToMerge = await getAccount(db, redis, dbOauthRes.account_id);
  if (!accountToMerge || accountToMerge.id === activeAccount.id) {
    return cleanupMerge();
  }

  await req.db.transaction(async (db) => {
    if (oauth_to_merge.service === "slack") {
      await db.query(sql`
        UPDATE slack_oauth
        SET account_id = ${activeAccount.id}
        WHERE account_id = ${accountToMerge.id}
      `);
    } else if (oauth_to_merge.service === "github") {
      await db.query(sql`
        UPDATE github_oauth
        SET account_id = ${activeAccount.id}
        WHERE account_id = ${accountToMerge.id}
      `);
    }

    await db.query(sql`
      INSERT INTO status_preset
        (account_id, status_emoji, status_text)
      SELECT ${activeAccount.id}, status_emoji, status_text FROM status_preset
      WHERE account_id = ${accountToMerge.id}
    `);
  });

  return cleanupMerge();
}

module.exports = async function authMerge(req, res) {
  if (req.method === "POST") {
    return await performMerge(req, res);
  }

  const activeAccount = await req.getAccount();
  if (!activeAccount) {
    res.statusCode = 404;
    return;
  }

  const nothingToMerge = () => {
    delete req.session.oauth_to_merge;

    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );

    return;
  };

  if (!req.session.oauth_to_merge || !req.session.oauth_to_merge.oauth_id) {
    return nothingToMerge();
  }

  const oauth_to_merge = req.session.oauth_to_merge;

  const db = await req.db();

  let dbOauthRes = null;

  if (oauth_to_merge.service === "slack") {
    dbOauthRes = (
      await db.query(sql`
        SELECT id, account_id
        FROM slack_oauth
        WHERE id = ${oauth_to_merge.oauth_id}
        LIMIT 1;
      `)
    ).rows[0];
  } else if (oauth_to_merge.service === "github") {
    dbOauthRes = (
      await db.query(sql`
        SELECT id, account_id
        FROM github_oauth
        WHERE id = ${oauth_to_merge.oauth_id}
        LIMIT 1;
      `)
    ).rows[0];
  }

  if (!dbOauthRes) {
    return nothingToMerge();
  }

  const redis = await req.redis();

  const accountToMerge = await getAccount(db, redis, dbOauthRes.account_id);

  if (!accountToMerge) {
    return nothingToMerge();
  }

  const targetOauth = accountToMerge.oauths.find(
    (o) => o.service === oauth_to_merge.service && o.oauth_id === dbOauthRes.id
  );

  return res.render(tmpl, {
    activeAccount,
    accountToMerge,
    targetOauth,
  });
};
