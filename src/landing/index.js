const url = require("url");
const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (slackOauths.length) {
    const { user_id } = slackOauths[0];
    res.writeHead(302, {
      Location: url.resolve(
        req.absolute,
        req.app.routes.slackPresetsList.stringify({ user_id })
      ),
    });
    return;
  }

  return res.render(tmpl, {
    client_id: config.slack.client_id,
    state: "", // TODO
  });
};
