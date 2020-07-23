const url = require("url");

const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");

const { getEmojiHTML } = require("./common.js");

const tmpl = require.resolve("./templates/browse.handlebars");

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji).map((name) => ({
  name,
  html: nodeEmoji.emoji[name],
}));

module.exports = async function presetsBrowse(req, res) {
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
    SELECT p.id, p.account_id
    FROM preset p
    WHERE p.account_id = ${account.id}
    ORDER BY p.id DESC;
  `);

  const slackStatuses = {};
  const githubStatuses = {};

  if (dbPresetsRes.rows.length) {
    const presetIds = dbPresetsRes.rows.map((r) => r.id);

    const dbSlackStatusesRes = await db.query(sql`
      SELECT s.id, s.preset_id, s.slack_oauth_id, s.status_text, s.status_emoji
      FROM slack_status s
      WHERE s.preset_id = ANY (${presetIds})
      ORDER BY s.id DESC;
    `);

    for (const row of dbSlackStatusesRes.rows) {
      const oauth = account.oauths.find(
        (o) => o.service === "slack" && o.oauth_id === row.slack_oauth_id
      );

      if (!oauth) {
        continue;
      }

      if (!slackStatuses[row.preset_id]) {
        slackStatuses[row.preset_id] = [];
      }

      const status_emoji_html = getEmojiHTML(row.status_emoji, true);
      const status_text_html = getEmojiHTML(
        Handlebars.escapeExpression(row.status_text)
      );

      slackStatuses[row.preset_id].push({
        id: row.id,
        slack_oauth_id: row.slack_oauth_id,
        status_text: row.status_text,
        status_emoji: row.status_emoji,
        oauth,
        status_emoji_html: status_emoji_html.html,
        status_text_html: status_text_html.html,
        custom_emoji: status_emoji_html.custom_emoji,
      });
    }

    const dbGithubStatusesRes = await db.query(sql`
      SELECT s.id, s.preset_id, s.github_oauth_id, s.status_text, s.status_emoji
      FROM github_status s
      WHERE s.preset_id = ANY(${presetIds})
      ORDER BY s.id DESC;
    `);

    for (const row of dbGithubStatusesRes.rows) {
      const oauth = account.oauths.find(
        (o) => o.service === "github" && o.oauth_id === row.github_oauth_id
      );

      if (!oauth) {
        continue;
      }

      if (!githubStatuses[row.preset_id]) {
        githubStatuses[row.preset_id] = [];
      }

      const status_emoji_html = getEmojiHTML(row.status_emoji, true);
      const status_text_html = getEmojiHTML(
        Handlebars.escapeExpression(row.status_text)
      );

      githubStatuses[row.preset_id].push({
        id: row.id,
        github_oauth_id: row.github_oauth_id,
        status_text: row.status_text,
        status_emoji: row.status_emoji,
        oauth,
        status_emoji_html: status_emoji_html.html,
        status_text_html: status_text_html.html,
        custom_emoji: status_emoji_html.custom_emoji,
      });
    }
  }

  const presets = [];

  for (const row of dbPresetsRes.rows) {
    const statuses = [
      ...(slackStatuses[row.id] ?? []),
      ...(githubStatuses[row.id] ?? []),
    ];
    if (!statuses.length) {
      continue;
    }

    presets.push({
      id: row.id,
      main_status: statuses[0],
      statuses,
    });
  }

  return res.render(tmpl, {
    account,
    presets,
    can_save_presets: presets.length < 100,
    emoji_options: DEFAULT_EMOJI_LIST,
  });
};
