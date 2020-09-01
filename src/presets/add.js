const url = require("url");

const sql = require("pg-template-tag").default;
const stringLength = require("string-length");

const { getEmojiHTML } = require("./common.js");
const { normalizeStatus } = require("../normalize-status.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function presetAdd(req, res) {
  const { status_emoji, status_text, empty } = normalizeStatus(req.formBody);

  if (empty) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (status_emoji && status_emoji.length > 120) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (status_text && stringLength(status_text) > 120) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (status_emoji && getEmojiHTML(status_emoji, true).custom_emoji) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const account = await req.getAccount();

  if (!account) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const db = await req.db();

  const can_save_presets =
    (
      await db.query(sql`
        SELECT count(DISTINCT preset.id)
        FROM preset
        INNER JOIN (
          SELECT preset_id FROM slack_status
          UNION
          SELECT preset_id FROM github_status
        ) s ON s.preset_id = preset.id
        WHERE preset.account_id = ${account.id};
      `)
    ).rows[0].count < 100;

  if (!can_save_presets) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const slack_oauth_ids = req.formBody.getAll("slack_oauth_id");

  if (
    !slack_oauth_ids.every((oauth_id) =>
      account.oauths.find(
        (o) => o.service === "slack" && o.oauth_id === oauth_id
      )
    )
  ) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const github_oauth_ids = req.formBody.getAll("github_oauth_id");

  if (
    !github_oauth_ids.every((oauth_id) =>
      account.oauths.find(
        (o) => o.service === "github" && o.oauth_id === oauth_id
      )
    )
  ) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  if (!slack_oauth_ids.length && !github_oauth_ids.length) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  await req.db.transaction(async (db) => {
    const dbPresetResp = await db.query(sql`
      INSERT INTO preset (
        account_id
      )
      VALUES (
        ${account.id}
      )
      RETURNING id;
    `);

    const presetId = dbPresetResp.rows[0].id;

    for (const slack_oauth_id of slack_oauth_ids) {
      await db.query(sql`
        INSERT INTO slack_status (
          preset_id,
          slack_oauth_id,
          status_text,
          status_emoji
        )
        VALUES (
          ${presetId},
          ${slack_oauth_id},
          ${status_text},
          ${status_emoji}
        )
        RETURNING id;
      `);
    }

    for (const github_oauth_id of github_oauth_ids) {
      await db.query(sql`
        INSERT INTO github_status (
          preset_id,
          github_oauth_id,
          status_text,
          status_emoji
        )
        VALUES (
          ${presetId},
          ${github_oauth_id},
          ${status_text},
          ${status_emoji}
        )
        RETURNING id;
      `);
    }
  });

  res.statusCode = 303;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.presetsBrowse.stringify(), req.absolute)
  );
};
