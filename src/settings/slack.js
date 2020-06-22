const url = require("url");

const slackApi = require("../external/slack.js");
const {
  getProfile,
  getTeam,
  getTeamEmojis,
  emojiHTMLGetter,
} = require("../presets/slack/common.js");
const config = require("../config.js");

const tmpl = require.resolve("./templates/slack.handlebars");

module.exports = async function settingsSlack(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (!slackOauths.length) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  if (!(req.params && req.params.oauth_id)) {
    const { oauth_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.settingsSlack.stringify({ oauth_id }),
        req.absolute
      )
    );
    return;
  }

  const user_oauth = slackOauths.find(
    (o) => o.oauth_id === req.params.oauth_id
  );

  if (!user_oauth) {
    const { oauth_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.settingsSlack.stringify({ oauth_id }),
        req.absolute
      )
    );
    return;
  }

  const db = await req.db();
  const redis = await req.redis();

  const profiles = await Promise.all(
    slackOauths.map((o) => getProfile(db, redis, o.access_token, o.user_id))
  );

  const teams = await Promise.all(
    slackOauths.map((o) => getTeam(db, redis, o.access_token, o.team_id))
  );

  const teamEmojis = await Promise.all(
    slackOauths.map((o) => getTeamEmojis(db, redis, o.access_token, o.team_id))
  );

  const slacks = slackOauths.map((o, index) => {
    const { profile } = profiles[index];
    const { emoji: teamEmoji } = teamEmojis[index];
    const getEmojiHTML = emojiHTMLGetter(teamEmoji);
    let current_status = null;

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

    const { team } = teams[index];

    return {
      oauth_id: o.oauth_id,
      user_id: o.user_id,
      profile,
      team,
      teamEmoji,
      getEmojiHTML,
      current_status,
    };
  });

  const activeSlack = slacks.find((s) => s.oauth_id === user_oauth.oauth_id);
  activeSlack.is_active = true;

  return res.render(tmpl, {
    slacks,
    activeSlack,
    slackAuth: {
      client_id: config.slack.client_id,
      scope: config.slack.scope,
      state: "", // TODO
    },
  });
};
