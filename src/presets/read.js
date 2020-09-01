const url = require("url");

const config = require("../config.js");
const { getOauthState } = require("../auth/oauth-state.js");
const { queryPresetWithStatuses } = require("../presets/common.js");
const tmpl = require.resolve("./templates/read.handlebars");

module.exports = async function presetRead(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const preset_id = req.params.preset_id;

  if (!preset_id) {
    res.statusCode = 404;

    return;
  }

  const db = await req.db();

  const preset = await queryPresetWithStatuses(db, account, preset_id);

  if (!preset || !preset.statuses.length) {
    res.statusCode = 404;
    return;
  }

  const state = getOauthState(req.session.id, req.url);

  return res.render(tmpl, {
    account,
    preset,
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
