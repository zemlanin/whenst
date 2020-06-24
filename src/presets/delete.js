const url = require("url");

const sql = require("pg-template-tag").default;

const TODO_BAD_REQUEST = 400;

module.exports = async function presetDelete(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const presetId = req.formBody.get("id");

  if (!presetId) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const db = await req.db();

  await db.query(sql`
    DELETE FROM status_preset
    WHERE id = ${presetId}
      AND account_id = ${account.id}
  `);

  res.statusCode = 303;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
  );
};
