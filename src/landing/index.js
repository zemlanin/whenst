const url = require("url");

const { getOauthState } = require("../auth/oauth-state.js");
const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res) {
  const account = await req.getAccount();
  if (account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsBrowse.stringify(), req.absolute)
    );
    return;
  }

  const state = getOauthState(
    req.session.id,
    req.app.routes.presetsBrowse.stringify()
  );

  return res.render(tmpl, {
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
