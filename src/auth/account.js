const sql = require("pg-template-tag").default;

const slackApi = require("../external/slack.js");
const githubApi = require("../external/github.js");
const { getProfile, getTeam } = require("../presets/slack/common.js");
const { getEmojiHTML } = require("../presets/common.js");
const { normalizeStatus } = require("../normalize-status.js");

module.exports = {
  getAccount,
};

async function getAccount(db, redis, id) {
  if (!id) {
    return null;
  }

  const dbAccountRes = await db.query(sql`
    SELECT a.id
    FROM account a
    WHERE a.id = ${id}
    LIMIT 1;
  `);

  if (!dbAccountRes.rows.length) {
    return null;
  }

  const account_id = dbAccountRes.rows[0].id;

  const oauths = [];

  const dbSlackOauthRes = await db.query(sql`
    SELECT s.id, s.user_id, s.team_id, s.access_token FROM slack_oauth s
    WHERE s.account_id = ${account_id} AND s.revoked = false
  `);

  const dbGithubOauthRes = await db.query(sql`
    SELECT o.id, o.user_id, o.access_token FROM github_oauth o
    WHERE o.account_id = ${account_id} AND o.revoked = false
  `);

  if (!dbSlackOauthRes.rows.length && !dbGithubOauthRes.rows.length) {
    return null;
  }

  for (const row of dbSlackOauthRes.rows) {
    const { access_token, user_id, team_id } = row;

    const { profile } = await getProfile(db, redis, access_token, user_id);
    const { team } = await getTeam(db, redis, access_token, team_id);

    let current_status = null;
    if (profile.status_text || profile.status_emoji) {
      const status_emoji_html = getEmojiHTML(profile.status_emoji, true);

      current_status = {
        status_emoji: profile.status_emoji,
        status_text: slackApi.decodeStatusText(profile.status_text),
        status_emoji_html: status_emoji_html.html,
        status_text_html: getEmojiHTML(profile.status_text).html,
        custom_emoji: status_emoji_html.custom_emoji,
      };
    }

    oauths.push({
      service: "slack",
      profile,
      team,
      user_id,
      oauth_id: row.id,
      access_token,
      current_status,
    });
  }

  for (const row of dbGithubOauthRes.rows) {
    const { access_token, user_id } = row;

    const { profile } = await githubApi.getProfile(access_token);

    let current_status = null;
    if (profile.status?.emoji || profile.status?.message) {
      current_status = normalizeStatus(
        {
          status_emoji: profile.status.emoji,
          status_text: githubApi.decodeStatusText(profile.status.message),
        },
        { behavior: normalizeStatus.BEHAVIOR.github }
      );

      const status_emoji_html = getEmojiHTML(current_status.status_emoji, true);

      current_status.status_emoji_html = status_emoji_html.html;
      current_status.status_text_html = getEmojiHTML(
        current_status.status_text
      ).html;
      current_status.custom_emoji = status_emoji_html.custom_emoji;
    }

    oauths.push({
      service: "github",
      profile,
      user_id,
      oauth_id: row.id,
      access_token,
      current_status,
    });
  }

  return {
    id: account_id,
    account_id,
    oauths,
  };
}
