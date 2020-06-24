const url = require("url");

const { getProfile, getTeam } = require("../presets/slack/common.js");

const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function settingsIndex(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const db = await req.db();
  const redis = await req.redis();

  const slackOauths = account.oauths.filter((o) => o.service === "slack");

  const profiles = await Promise.all(
    slackOauths.map((o) => getProfile(db, redis, o.access_token, o.user_id))
  );

  const teams = await Promise.all(
    slackOauths.map((o) => getTeam(db, redis, o.access_token, o.team_id))
  );

  const slacks = slackOauths.map((o, index) => {
    const { team } = teams[index];
    const { profile } = profiles[index];

    return {
      oauth_id: o.oauth_id,
      user_id: o.user_id,
      profile,
      team,
    };
  });

  return res.render(tmpl, {
    slacks,
    slackAuth: {
      client_id: config.slack.client_id,
      scope: config.slack.scope,
      state: "", // TODO
    },
  });
};
