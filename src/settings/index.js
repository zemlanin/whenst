const url = require("url");
const crypto = require("crypto");

const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

const getOauthState = (session) =>
  crypto.createHash("sha256").update(session.id).digest("hex");

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

  const state = getOauthState(req.session);

  return res.render(tmpl, {
    account,
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
