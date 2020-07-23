const url = require("url");

const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const { getOauthState } = require("../auth/oauth-state.js");
const { getEmojiHTML } = require("../presets/common.js");
const tmpl = require.resolve("./templates/read.handlebars");

module.exports = async function presetRead(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  if (!req.params.preset_id) {
    res.statusCode = 404;

    return;
  }

  const db = await req.db();

  const dbPresetRes = await db.query(sql`
    SELECT p.id, p.account_id
    FROM preset p
    WHERE p.id = ${req.params.preset_id}
      AND p.account_id = ${account.id}
    LIMIT 1;
  `);

  if (!dbPresetRes.rows.length) {
    res.statusCode = 404;

    return;
  }

  const preset_id = dbPresetRes.rows[0].id;

  const statuses = [];

  const dbSlackStatusesRes = await db.query(sql`
    SELECT s.id, s.preset_id, s.slack_oauth_id, s.status_text, s.status_emoji
    FROM slack_status s
    WHERE s.preset_id = ${preset_id}
    ORDER BY s.id DESC;
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
    WHERE s.preset_id = ${preset_id}
    ORDER BY s.id DESC;
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
      github_oauth_id: row.github_oauth_id,
      status_text: row.status_text,
      status_emoji: row.status_emoji,
      oauth,
      status_emoji_html: status_emoji_html.html,
      status_text_html: status_text_html.html,
      custom_emoji: status_emoji_html.custom_emoji,
    });
  }

  if (!statuses.length) {
    res.statusCode = 404;
    return;
  }

  const preset = {
    id: preset_id,
    account_id: dbPresetRes.rows[0].account_id,
    main_status: statuses[0],
    statuses,
  };

  const state = getOauthState(req.session.id, req.url);

  return res.render(tmpl, {
    account,
    preset,
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
  });
};
