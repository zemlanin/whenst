const url = require("url");
const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res) {
  const account = await req.getAccount();
  if (account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.presetsIndex.stringify(), req.absolute)
    );
    return;
  }

  return res.render(tmpl, {
    client_id: config.slack.client_id,
    scope: config.slack.scope,
    state: "", // TODO
  });
};
