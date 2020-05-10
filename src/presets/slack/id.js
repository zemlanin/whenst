const url = require("url");

const Handlebars = require("handlebars");

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
      url.resolve(req.absolute, req.app.routes.landing.stringify())
    );
    return;
  }

  const user_oauth = slackOauths.find((o) => o.user_id === req.params.user_id);

  if (!user_oauth) {
    res.statusCode = 404;
    return;
  }

  const { access_token, user_id, team_id } = user_oauth;

  const { status_text, status_emoji } = processPresetForm(
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

  const { emoji: teamEmojis } = await getTeamEmojis(
    db,
    redis,
    access_token,
    team_id
  );

  const getEmojiHTML = emojiHTMLGetter(teamEmojis);

  const preset = {
    status_text,
    status_emoji,
    status_text_html: getEmojiHTML(Handlebars.escapeExpression(status_text)),
    status_emoji_html: getEmojiHTML(status_emoji),
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
