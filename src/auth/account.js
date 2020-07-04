const sql = require("pg-template-tag").default;

const slackApi = require("../external/slack.js");
const { getProfile, getTeam } = slackApi;
const githubApi = require("../external/github.js");
const { getEmojiHTML } = require("../presets/common.js");
const { normalizeStatus } = require("../normalize-status.js");

const { decryptAccessToken } = require("./access-token-crypto.js");

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
    SELECT s.id, s.user_id, s.team_id, s.access_token, s.access_token_salt, s.access_token_encrypted
    FROM slack_oauth s
    WHERE s.account_id = ${account_id} AND s.revoked = false
  `);

  const dbGithubOauthRes = await db.query(sql`
    SELECT g.id, g.user_id, g.access_token, g.access_token_salt, g.access_token_encrypted
    FROM github_oauth g
    WHERE g.account_id = ${account_id} AND g.revoked = false
  `);

  if (!dbSlackOauthRes.rows.length && !dbGithubOauthRes.rows.length) {
    return null;
  }

  for (const row of dbSlackOauthRes.rows) {
    const { access_token_salt, access_token_encrypted, user_id, team_id } = row;

    const access_token = access_token_encrypted
      ? decryptAccessToken(access_token_encrypted, access_token_salt)
      : row.access_token;

    let profile;

    try {
      profile = (await getProfile(db, redis, access_token, user_id)).profile;
    } catch (e) {
      // TODO: notify about external API problems
      console.error(e);
      continue;
    }

    const { team } = await getTeam(db, redis, access_token, team_id);

    let current_status = null;
    if (profile.status_text || profile.status_emoji) {
      current_status = normalizeStatus(
        {
          status_emoji: profile.status_emoji,
          status_text: slackApi.decodeStatusText(profile.status_text),
        },
        { behavior: normalizeStatus.BEHAVIOR.slack }
      );

      const status_emoji_html = getEmojiHTML(current_status.status_emoji, true);

      current_status.status_emoji_html = status_emoji_html.html;
      current_status.status_text_html = getEmojiHTML(profile.status_text).html;
      current_status.custom_emoji = status_emoji_html.custom_emoji;
    } else {
      current_status = {
        empty: true,
        status_emoji: "",
        status_text: "",
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
    const { access_token_salt, access_token_encrypted, user_id } = row;

    const access_token = access_token_encrypted
      ? decryptAccessToken(access_token_encrypted, access_token_salt)
      : row.access_token;

    let profile;

    try {
      profile = (await githubApi.getProfile(access_token)).profile;
    } catch (e) {
      // TODO: notify about external API problems
      console.error(e);
      continue;
    }

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
        profile.status.message
      ).html;
      current_status.custom_emoji = status_emoji_html.custom_emoji;
    } else {
      current_status = {
        empty: true,
        status_emoji: "",
        status_text: "",
      };
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
