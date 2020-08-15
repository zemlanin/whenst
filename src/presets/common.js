const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

function getEmojiHTML(stringWithEmojis, wholeStringIsEmoji) {
  if (!stringWithEmojis) {
    return { html: "" };
  }

  if (wholeStringIsEmoji) {
    stringWithEmojis = `:${stringWithEmojis}:`;
  }

  let custom_emoji = false;

  const html = nodeEmoji.emojify(stringWithEmojis, function onMissing(name) {
    custom_emoji = true;
    return `:${name}:`;
  });

  if (custom_emoji) {
    return { html, custom_emoji };
  }

  return { html };
}

async function queryPresetWithStatuses(db, account, preset_id) {
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
      // oauth was unlinked, but status preset is still in db
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
      // oauth was unlinked, but status preset is still in db
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
    return;
  }

  return {
    id: preset_id,
    main_status: statuses[0],
    statuses,
  };
}

module.exports = {
  getEmojiHTML,
  queryPresetWithStatuses,
};
