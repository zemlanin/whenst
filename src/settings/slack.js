const url = require("url");

const {
  getProfile,
  getTeam,
  getTeamEmojis,
  emojiHTMLGetter,
} = require("../presets/slack/common.js");
const config = require("../config.js");

const tmpl = require.resolve("./templates/slack.handlebars");

module.exports = async function settingsSlack(req, res) {
  const activeSlack = await req.getActiveSlack();

  if (activeSlack && !(req.params && req.params.oauth_id)) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.settingsSlack.stringify({
          oauth_id: activeSlack.oauth_id,
        }),
        req.absolute
      )
    );
    return;
  }

  if (!activeSlack) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const db = await req.db();
  const redis = await req.redis();

  const slackOauths = await req.getSlackOauths();

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
    const { team } = teams[index];
    const { profile } = profiles[index];
    const { emoji: teamEmoji } = teamEmojis[index];
    const getEmojiHTML = emojiHTMLGetter(teamEmoji);

    return {
      oauth_id: o.oauth_id,
      user_id: o.user_id,
      profile,
      team,
      teamEmoji,
      getEmojiHTML,
      is_active: o.oauth_id === activeSlack.oauth_id,
    };
  });

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
