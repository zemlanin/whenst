const url = require("url");
const sql = require("pg-template-tag").default;

const slackApi = require("../../external/slack.js");

const {
  getProfile,
  getTeam,
  getTeamEmojis,
  emojiHTMLGetter,
} = require("./common.js");

const tmpl = require.resolve("./templates/id.handlebars");

module.exports = async function slackPresetId(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (!slackOauths.length) {
    res.writeHead(302, {
      Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
    });
    return;
  }

  const user_oauth = slackOauths.find((o) => o.user_id === req.params.user_id);

  if (!user_oauth) {
    res.statusCode = 404;
    return;
  }

  const { access_token, user_id, team_id } = user_oauth;

  const db = await req.db();
  const redis = await req.redis();

  const dbPresetsRes = await db.query(sql`
      SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
      WHERE p.slack_user_id = ${user_id}
        AND p.id = ${req.params.preset_id}
      ORDER BY p.id DESC;
    `);

  if (!dbPresetsRes.rows.length) {
    res.statusCode = 404;
    return;
  }

  const { profile } = await getProfile(db, redis, access_token, user_id);
  const { team } = await getTeam(db, redis, access_token, team_id);

  const { emoji: teamEmojis } = await getTeamEmojis(
    db,
    redis,
    access_token,
    team_id
  );

  const getEmojiHTML = emojiHTMLGetter(teamEmojis);
  const presetRow = dbPresetsRes.rows[0];
  const preset = {
    id: presetRow.id,
    status_text: presetRow.status_text,
    status_emoji: presetRow.status_emoji,
    status_text_html: getEmojiHTML(presetRow.status_text),
    status_emoji_html: getEmojiHTML(presetRow.status_emoji),
  };
  const current_status =
    profile.status_text || profile.status_emoji
      ? {
          status_text: slackApi.decodeStatusText(profile.status_text),
          status_emoji: profile.status_emoji,
          status_text_html: getEmojiHTML(profile.status_text),
          status_emoji_html: getEmojiHTML(profile.status_emoji),
        }
      : null;

  return res.render(tmpl, {
    oauth_id: user_oauth.id,
    user_id,
    profile,
    team,
    preset,
    current_status,
  });
};
