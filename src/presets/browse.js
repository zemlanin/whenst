const url = require("url");

const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");

const config = require("../config.js");
const { getOauthState } = require("../auth/oauth-state.js");
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

  const statuses = [];

  const dbSlackStatusesRes = await db.query(sql`
    SELECT s.id, s.preset_id, s.slack_oauth_id, s.status_text, s.status_emoji
    FROM slack_status s
    LEFT JOIN preset p ON p.id = s.preset_id
    WHERE p.account_id = ${account.id}
    ORDER BY p.id DESC, s.id DESC;
  `);

  for (const row of dbSlackStatusesRes.rows) {
    const oauth = account.oauths.find(
      (o) => o.service === "slack" && o.oauth_id === row.slack_oauth_id
    );

    if (!oauth) {
      continue;
    }

    const status_emoji_html = getEmojiHTML(row.status_emoji, true);
    const status_text_html = getEmojiHTML(
      Handlebars.escapeExpression(row.status_text)
    );

    statuses.push({
      id: row.id,
      preset_id: row.preset_id,
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
    LEFT JOIN preset p ON p.id = s.preset_id
    WHERE p.account_id = ${account.id}
    ORDER BY p.id DESC, s.id DESC;
  `);

  for (const row of dbGithubStatusesRes.rows) {
    const oauth = account.oauths.find(
      (o) => o.service === "github" && o.oauth_id === row.github_oauth_id
    );

    if (!oauth) {
      continue;
    }

    const status_emoji_html = getEmojiHTML(row.status_emoji, true);
    const status_text_html = getEmojiHTML(
      Handlebars.escapeExpression(row.status_text)
    );

    statuses.push({
      id: row.id,
      preset_id: row.preset_id,
      github_oauth_id: row.github_oauth_id,
      status_text: row.status_text,
      status_emoji: row.status_emoji,
      oauth,
      status_emoji_html: status_emoji_html.html,
      status_text_html: status_text_html.html,
      custom_emoji: status_emoji_html.custom_emoji,
    });
  }

  const presets = [];
  const presetsById = {};

  for (const status of statuses) {
    let preset = presetsById[status.preset_id];

    if (!preset) {
      preset = { id: status.preset_id, main_status: status, statuses: [] };

      presets.push(preset);
      presetsById[status.preset_id] = preset;
    }

    preset.statuses.push(status);
  }

  presets.sort((a, b) => b.id - a.id); // DESC

  const state = getOauthState(req.session.id, req.url);

  return res.render(tmpl, {
    account,
    presets,
    can_save_presets: presets.length < 100,
    can_link_accounts: account.oauths.length < 20,
    slackAuth: {
      client_id: config.slack.client_id,
      scope: config.slack.scope,
      state,
    },
    githubAuth: {
      client_id: config.github.client_id,
      scope: config.github.scope,
      state,
    },
    emoji_options: DEFAULT_EMOJI_LIST,
  });
};
