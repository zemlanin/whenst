const url = require("url");

const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");

const slackApi = require("../external/slack.js");
const githubApi = require("../external/github.js");

const { getEmojiHTML } = require("./common.js");

const tmpl = require.resolve("./templates/index.handlebars");

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji).map((name) => ({
  name,
  html: nodeEmoji.emoji[name],
}));

module.exports = async function presetsIndex(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const db = await req.db();

  const dbPresetsRes = await db.query(sql`
    SELECT p.id, p.account_id, p.status_text, p.status_emoji
    FROM status_preset p
    WHERE p.account_id = ${account.id}
    ORDER BY p.id DESC;
  `);

  let defaultEmoji = null;
  if (account.oauths.every((o) => o.service === "slack")) {
    defaultEmoji = slackApi.DEFAULT_STATUS_EMOJI;
  } else if (account.oauths.every((o) => o.service === "github")) {
    defaultEmoji = githubApi.DEFAULT_STATUS_EMOJI;
  }

  let presets = dbPresetsRes.rows.map((presetRow) => {
    const status_emoji = presetRow.status_emoji || defaultEmoji;

    const status_emoji_html = getEmojiHTML(status_emoji, true);

    return {
      id: presetRow.id,
      status_emoji,
      status_text: presetRow.status_text,
      status_emoji_html: status_emoji_html.html,
      status_text_html: getEmojiHTML(
        Handlebars.escapeExpression(presetRow.status_text)
      ).html,
      unknown_emoji: status_emoji_html.unknown_emoji,
    };
  });

  return res.render(tmpl, {
    account,
    presets,
    default_emoji_html: getEmojiHTML(defaultEmoji, true).html,
    emoji_options: DEFAULT_EMOJI_LIST,
  });
};
