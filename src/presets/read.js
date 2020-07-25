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

  const preset_id = req.params.preset_id;

  const statuses = [];

  const dbSlackStatusesRes = await db.query(sql`
    SELECT s.id, s.preset_id, s.slack_oauth_id, s.status_text, s.status_emoji
    FROM slack_status s
    LEFT JOIN preset p ON p.id = s.preset_id
    WHERE p.account_id = ${account.id}
      AND p.id = ${preset_id}
    ORDER BY s.id DESC;
  `);

  for (const row of dbSlackStatusesRes.rows) {
    const oauth = account.oauths.find(
      (o) => o.service === "slack" && o.oauth_id === row.slack_oauth_id
    );

    if (!oauth) {
      console.error(`something wrong with preset ${row.preset_id}: no oauth`);

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
    LEFT JOIN preset p ON p.id = s.preset_id
    WHERE p.account_id = ${account.id}
      AND p.id = ${preset_id}
    ORDER BY s.id DESC;
  `);

  for (const row of dbGithubStatusesRes.rows) {
    const oauth = account.oauths.find(
      (o) => o.service === "github" && o.oauth_id === row.github_oauth_id
    );

    if (!oauth) {
      console.error(`something wrong with preset ${row.preset_id}: no oauth`);

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
