const url = require("url");

const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");

const slackApi = require("../../external/slack.js");

const tmpl = require.resolve("./templates/index.handlebars");

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji).map((name) => ({
  name,
  html: nodeEmoji.emoji[name],
}));

module.exports = async function slackPresetsList(req, res) {
  const activeSlack = await req.getActiveSlack();

  if (activeSlack && !(req.params && req.params.oauth_id)) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.slackPresetsList.stringify({
          oauth_id: activeSlack.oauth_id,
        }),
        req.absolute
      )
    );
    return;
  }

  if (!activeSlack) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const db = await req.db();

  const dbPresetsRes = await db.query(sql`
      SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
      WHERE p.slack_user_id = ${activeSlack.user_id}
      ORDER BY p.id DESC;
    `);

  const presets = dbPresetsRes.rows.map((presetRow) => {
    const status_emoji_html = activeSlack.getEmojiHTML(
      presetRow.status_emoji || slackApi.DEFAULT_STATUS_EMOJI,
      true
    );

    return {
      id: presetRow.id,
      status_emoji: presetRow.status_emoji || slackApi.DEFAULT_STATUS_EMOJI,
      status_text: presetRow.status_text,
      status_emoji_html: status_emoji_html.html,
      status_text_html: activeSlack.getEmojiHTML(
        Handlebars.escapeExpression(presetRow.status_text)
      ).html,
      unknown_emoji: status_emoji_html.unknown_emoji,
    };
  });

  if (activeSlack.current_status) {
    const current_status = activeSlack.current_status;
    for (const preset of presets) {
      if (
        preset.status_text === current_status.status_text &&
        preset.status_emoji === current_status.status_emoji
      ) {
        preset.is_current_status = true;
      }
    }
  }

  return res.render(tmpl, {
    activeSlack,
    presets,
    emoji_options: DEFAULT_EMOJI_LIST.concat(
      Object.keys(activeSlack.teamEmoji).map((name) => ({
        name,
        html: activeSlack.getEmojiHTML(name, true).html,
      }))
    ),
  });
};
