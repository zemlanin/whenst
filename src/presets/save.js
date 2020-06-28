const url = require("url");

const sql = require("pg-template-tag").default;
const stringLength = require("string-length");

const { getEmojiHTML } = require("./common.js");
const { normalizeStatus } = require("../normalize-status.js");

const TODO_BAD_REQUEST = 400;

module.exports = async function presetSave(req, res) {
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

  await db.query(sql`
    INSERT INTO status_preset (
      account_id,
      status_text,
      status_emoji
    )
    VALUES (
      ${account.id},
      ${status_text},
      ${status_emoji}
    )
    ON CONFLICT DO NOTHING
    RETURNING id;
  `);

  res.statusCode = 303;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
  );
};
