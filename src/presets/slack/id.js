const url = require("url");

const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

const slackApi = require("../../external/slack.js");

const {
  getProfile,
  getTeam,
  getTeamEmojis,
  emojiHTMLGetter,
  processPresetForm,
} = require("./common.js");

const tmpl = require.resolve("./templates/id.handlebars");
const TODO_BAD_REQUEST = 400;

module.exports = async function slackPresetId(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (!slackOauths.length) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const user_oauth = slackOauths.find((o) => o.user_id === req.params.user_id);

  if (!user_oauth) {
    res.statusCode = 404;
    return;
  }

  const { access_token, user_id, team_id } = user_oauth;

  let { status_text, status_emoji } = processPresetForm(
    new url.URL(req.url, req.absolute).searchParams
  );

  if (!status_emoji && !status_text) {
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const db = await req.db();
  const redis = await req.redis();

  const { profile } = await getProfile(db, redis, access_token, user_id);
  const { team } = await getTeam(db, redis, access_token, team_id);

  const { emoji: teamEmoji } = await getTeamEmojis(
    db,
    redis,
    access_token,
    team_id
  );

  let current_status = null;
  const getEmojiHTML = emojiHTMLGetter(teamEmoji);

  if (profile.status_text || profile.status_emoji) {
    const status_emoji_html = getEmojiHTML(profile.status_emoji);

    current_status = {
      status_emoji: profile.status_emoji,
      status_text: slackApi.decodeStatusText(profile.status_text),
      status_emoji_html: status_emoji_html.html,
      status_text_html: getEmojiHTML(profile.status_text).html,
      unknown_emoji: status_emoji_html.unknown_emoji,
    };
  }

  const status_emoji_html = getEmojiHTML(status_emoji);

  const preset = {
    status_emoji,
    status_text,
    status_emoji_html: status_emoji_html.html,
    status_text_html: getEmojiHTML(Handlebars.escapeExpression(status_text))
      .html,
    unknown_emoji: status_emoji_html.unknown_emoji,
  };

  if (status_emoji && status_emoji !== slackApi.DEFAULT_STATUS_EMOJI) {
    preset.already_saved = (
      await db.query(sql`
        SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
        WHERE p.slack_user_id = ${user_id}
          AND p.status_text = ${status_text}
          AND p.status_emoji = ${status_emoji}
        ORDER BY p.id DESC
        LIMIT 1;
      `)
    ).rows.find(Boolean);
  } else {
    preset.already_saved = (
      await db.query(sql`
        SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
        WHERE p.slack_user_id = ${user_id}
          AND p.status_text = ${status_text}
          AND (p.status_emoji = '' OR p.status_emoji = ${slackApi.DEFAULT_STATUS_EMOJI})
        ORDER BY p.id DESC
        LIMIT 1;
      `)
    ).rows.find(Boolean);
  }

  preset.is_current_status = Boolean(
    current_status &&
      preset.status_text === current_status.status_text &&
      (preset.status_emoji === current_status.status_emoji ||
        (!preset.status_emoji &&
          current_status.status_emoji === slackApi.DEFAULT_STATUS_EMOJI))
  );

  return res.render(tmpl, {
    oauth_id: user_oauth.id,
    user_id,
    profile,
    team,
    preset,
    current_status,
  });
};
